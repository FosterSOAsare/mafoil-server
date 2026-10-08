const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const User = require("../../schemas/User.schema");
const Newsletter = require("../../schemas/Newsletter.schema");
const generateCode = require("../../utils/generateCode");
const { signToken, verifyToken, getBearerToken } = require("../../libs/auth-token");
const { sendPasswordResetEmail, sendEmailVerificationEmail } = require("../../libs/nodemailer");
const { isNonEmptyString, isValidEmail, normalizeEmail, isValidPassword, PASSWORD_RULE } = require("../../utils/validate");

const INVALID_LOGIN = "Invalid email or password";
const INVALID_CODE = "The code is invalid or has expired. Please request a new one.";
const RESET_FAILED = "This password reset link is invalid or has expired. Please start again.";
const VERIFICATION_MODES = ["accountverification", "resetpassword"];
const MAX_CODE_ATTEMPTS = 5;

// Generates a code for `purpose`, saves it (hashed, with an expiry) and then emails it.
// Saving first means the emailed code always works.
async function sendCode(user, purpose) {
	const code = generateCode();
	await user.storeCode(code, purpose);
	user = await user.save();
	await (purpose === "resetpassword" ? sendPasswordResetEmail : sendEmailVerificationEmail)(user.email, code);
	return user;
}

const controllerAuthLocalLogin = asyncHandler(async (req, res) => {
	const { email, password } = req.body;
	if (!isValidEmail(email) || typeof password !== "string" || !password) {
		res.status(400);
		throw new Error(INVALID_LOGIN);
	}
	let user = await User.findOne({ email: normalizeEmail(email) });

	// Same message for an unknown email and a wrong password, so accounts can't be discovered
	if (!user || !(await user.comparePassword(password))) {
		res.status(400);
		throw new Error(INVALID_LOGIN);
	}
	// Unverified: send a fresh verification code and tell the client to show the verify page
	if (!user.verified) {
		await sendCode(user, "accountverification");
		res.status(401);
		throw new Error("Email is not verified , redirecting you to verify your email address");
	}

	const { fullname, activated, _id, balance, is_admin } = user;
	const subscribed = Boolean(await Newsletter.exists({ email: user.email, status: "active" }));
	res.status(200).json({ email: user.email, fullname, activated, _id, balance, is_admin, subscribed, token: signToken(user) });
});

const controllerAuthLocalRegister = asyncHandler(async (req, res) => {
	let { email, password, fullname, referrer } = req.body;

	if (!isValidEmail(email)) {
		res.status(400);
		throw new Error("Please provide a valid email address");
	}
	if (!isValidPassword(password)) {
		res.status(400);
		throw new Error(PASSWORD_RULE);
	}
	if (!isNonEmptyString(fullname, 100) || fullname.trim().length < 3) {
		res.status(400);
		throw new Error("Please provide your full name (3 to 100 characters)");
	}
	email = normalizeEmail(email);
	fullname = fullname.trim();

	// The response is the same whether or not the email is already registered, so this can't be used to
	// discover accounts. An unverified account gets a new verification code; a verified one gets nothing.
	const existing = await User.findOne({ email });
	if (existing) {
		if (!existing.verified) await sendCode(existing, "accountverification");
		return res.status(200).json({ email });
	}

	// New accounts start inactive and must pay the activation fee (/user/activate) before checking out
	const refAccount = mongoose.isValidObjectId(referrer) ? await User.findOne({ _id: referrer }, { _id: 1 }) : null;
	const user = new User({ email, password, fullname, activated: false, verified: false, is_admin: false, ...(refAccount && { referrer: refAccount._id }) });
	try {
		await sendCode(user, "accountverification");
	} catch (e) {
		// A concurrent registration with the same email won the race: respond as if it existed already
		if (e?.code === 11000) return res.status(200).json({ email });
		throw e;
	}
	res.status(200).json({ email });
});

const controllerResetPassword = asyncHandler(async (req, res) => {
	let { email } = req.body;
	if (!isValidEmail(email)) {
		res.status(400);
		throw new Error("Please provide a valid email address");
	}
	// Only verified accounts get a reset email, but the response is the same either way
	// so this endpoint can't be used to find out which emails have accounts
	const account = await User.findOne({ email: normalizeEmail(email) });
	if (account?.verified) {
		await sendCode(account, "resetpassword");
	}
	res.status(200).json({ success: true });
});

const controllerVerifyEmail = asyncHandler(async (req, res) => {
	let { email, code, mode } = req.body;
	if (!isValidEmail(email) || typeof code !== "string" || !/^\d{6}$/.test(code) || !VERIFICATION_MODES.includes(mode)) {
		res.status(400);
		throw new Error(INVALID_CODE);
	}
	email = normalizeEmail(email);

	// Count the guess before checking it, atomically, so at most MAX_CODE_ATTEMPTS guesses are possible per code
	const user = await User.findOneAndUpdate(
		{ email, codePurpose: mode, codeExpires: { $gt: new Date() }, codeAttempts: { $lt: MAX_CODE_ATTEMPTS } },
		{ $inc: { codeAttempts: 1 } },
		{ new: true }
	);
	if (!user || !user.hasActiveCode(mode) || !(await user.compareCode(code))) {
		// Unknown email, no active code, too many guesses and a wrong code all look the same
		res.status(400);
		throw new Error(INVALID_CODE);
	}

	user.clearCode();
	if (mode === "accountverification") {
		user.verified = true;
		await user.save();
		return res.status(200).json({ success: true });
	}

	// Reset: swap the code for a single-use token that authorises setting the new password
	const token = user.createResetToken();
	await user.save();
	res.status(200).json({ token });
});

const controllerConfirmReset = asyncHandler(async (req, res) => {
	const { email, token, newPassword } = req.body;
	if (!isValidEmail(email) || typeof token !== "string" || !token) {
		res.status(400);
		throw new Error(RESET_FAILED);
	}
	if (!isValidPassword(newPassword)) {
		res.status(400);
		throw new Error(PASSWORD_RULE);
	}

	const user = await User.findOne({ email: normalizeEmail(email) });
	if (!user || !user.checkResetToken(token)) {
		res.status(400);
		throw new Error(RESET_FAILED);
	}
	// Also clears the token and logs out every existing session
	await user.updatePassword(newPassword);
	await user.save();

	res.status(200).json({ success: true });
});

const controllerResendEmail = asyncHandler(async (req, res) => {
	let { email, mode } = req.body;
	if (!isValidEmail(email) || !VERIFICATION_MODES.includes(mode)) {
		res.status(400);
		throw new Error("Please provide a valid email address");
	}

	// Same response whether or not the account exists, so this can't be used to discover accounts.
	// Verification codes only go to unverified accounts, reset codes only to verified ones.
	const account = await User.findOne({ email: normalizeEmail(email) });
	if (account && (mode === "accountverification" ? !account.verified : account.verified)) {
		await sendCode(account, mode);
	}
	res.status(200).json({ success: true });
});

const controllerGetUser = asyncHandler(async (req, res) => {
	const subscribed = Boolean(await Newsletter.exists({ email: req.user.email, status: "active" }));
	res.status(200).json({ ...req.user, subscribed });
});

const controllerLogoutUser = asyncHandler(async (req, res) => {
	// With a valid token, invalidate it (and the user's other sessions) by bumping the token version.
	// Without one there is nothing to revoke; the client just discards what it has.
	const payload = verifyToken(getBearerToken(req));
	if (payload?.userId && mongoose.isValidObjectId(payload.userId)) {
		await User.updateOne({ _id: payload.userId, tokenVersion: payload.tv || 0 }, { $inc: { tokenVersion: 1 } });
	}
	res.status(200).json({ success: true });
});

module.exports = {
	controllerAuthLocalRegister,
	controllerAuthLocalLogin,
	controllerResetPassword,
	controllerConfirmReset,
	controllerGetUser,
	controllerLogoutUser,
	controllerVerifyEmail,
	controllerResendEmail,
};
