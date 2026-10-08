const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../../schemas/User.schema");
const Newsletter = require("../../schemas/Newsletter.schema");
const generateCode = require("../../utils/generateCode");
const { sendPasswordResetEmail, sendEmailVerificationEmail } = require("../../libs/nodemailer");
const { isNonEmptyString, isValidEmail, normalizeEmail, isValidPassword, PASSWORD_RULE } = require("../../utils/validate");

const INVALID_LOGIN = "Invalid email or password";
const INVALID_CODE = "The provided code is invalid";
const VERIFICATION_MODES = ["accountverification", "resetpassword"];

// Generates a code, saves it (hashed) and then emails it. Saving first means the emailed code always works.
async function controllerVerificationEmail(user, sendEmail) {
	const code = generateCode();
	await user.storeCode(code);
	user = await user.save();
	await sendEmail(user.email, code);
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
	// Check if user's email is verified , if not send verification email and throw an unverified email error
	if (!user.verified) {
		user = await controllerVerificationEmail(user, sendEmailVerificationEmail);
		res.status(401);
		throw new Error("Email is not verified , redirecting you to verify your email address");
	}

	const { fullname, activated, _id, balance, is_admin } = user;
	const token = jwt.sign({ userId: _id, email: user.email }, process.env.SECRET, {
		expiresIn: "30d",
	});
	const subscribed = Boolean(await Newsletter.exists({ email: user.email, status: "active" }));

	res.status(200).json({ email: user.email, fullname, activated, _id, balance, is_admin, subscribed, token });
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
	// Check if the user already exists
	let user = await User.findOne({ email });
	if (user) {
		res.status(400);
		throw new Error("User already exists , please sign in");
	}
	// Create new user based on referrer
	// New accounts start inactive and must pay the activation fee (/user/activate) before checking out
	let refAccount = mongoose.isValidObjectId(referrer) ? await User.findOne({ _id: referrer }, { _id: 1 }) : null;
	user = new User({ email, password: password, fullname: fullname, activated: false, verified: false, is_admin: false, ...(refAccount && { referrer: refAccount._id }) });

	// Send email for verification , set code and save user
	user = await controllerVerificationEmail(user, sendEmailVerificationEmail);

	let { _id } = user;
	res.status(200).json({ email, _id });
});

const controllerResetPassword = asyncHandler(async (req, res) => {
	let { email } = req.body;
	if (!isValidEmail(email)) {
		res.status(400);
		throw new Error("Please provide a valid email address");
	}
	// Only verified accounts get a reset email, but the response is the same either way
	// so this endpoint can't be used to find out which emails have accounts
	let account = await User.findOne({ email: normalizeEmail(email) });
	if (account?.verified) {
		await controllerVerificationEmail(account, sendPasswordResetEmail);
	}
	res.status(200).json({ success: true });
});

const controllerChangePassword = asyncHandler(async (req, res) => {
	let { email, password, newPassword } = req.body;
	if (!email || !newPassword || !password) {
		res.status(400);
		throw new Error("Missing required fields");
	}
	// Fetch user information
	let account = await User.findOne({ email: email.toLowerCase() });
	if (!account) {
		res.status(404);
		throw new Error("Account does not exist");
	}
	let valid = false;

	// If password , compare passwords and update valid
	if (password && account.password) {
		valid = await account.comparePassword(password);
	}
	if (!valid) {
		res.status(404);
		throw new Error("The provided password is invalid");
	}
	await account.updatePassword(newPassword);
	await account.save();

	res.status(200).json({ success: true });
});

const controllerVerifyEmail = asyncHandler(async (req, res) => {
	let { email, code, mode } = req.body;
	if (!isValidEmail(email) || typeof code !== "string" || !/^\d{6}$/.test(code) || !VERIFICATION_MODES.includes(mode)) {
		res.status(400);
		throw new Error(INVALID_CODE);
	}
	email = normalizeEmail(email);

	let user = await User.findOne({ email });
	if (!user) {
		res.status(400);
		throw new Error(INVALID_CODE);
	}
	// No stored code (already used, or never sent): treat it like a wrong code instead of crashing in bcrypt
	if (!user.code && (mode === "resetpassword" || !user.verified)) {
		res.status(400);
		throw new Error(INVALID_CODE);
	}

	// Check if user is already verified
	if (!user.verified || mode.toLowerCase() === "resetpassword") {
		let valid = await user.compareCode(code);
		if (!valid) {
			res.status(400);
			throw new Error(INVALID_CODE);
		}
	}
	if (mode.toLowerCase() === "resetpassword") {
		res.status(200).json({ code: user.code });
		return;
	}
	// Update verification status
	await User.updateOne({ email }, { $set: { verified: true }, $unset: { code: null } });

	res.status(200).json({ success: true });
});
const controllerConfirmReset = asyncHandler(async (req, res) => {
	let { email, code, newPassword } = req.body;
	if (!isValidEmail(email) || typeof code !== "string" || !code) {
		res.status(400);
		throw new Error("Password reset was unsuccessful");
	}
	if (!isValidPassword(newPassword)) {
		res.status(400);
		throw new Error(PASSWORD_RULE);
	}

	let user = await User.findOne({ email: normalizeEmail(email) });
	// Confirm code
	if (!user || !user.code || code !== user.code) {
		res.status(400);
		throw new Error("Password reset was unsuccessful");
	}
	// Update password
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
	let account = await User.findOne({ email: normalizeEmail(email) });
	if (account && (mode === "accountverification" ? !account.verified : account.verified)) {
		await controllerVerificationEmail(account, mode === "accountverification" ? sendEmailVerificationEmail : sendPasswordResetEmail);
	}
	res.status(200).json({ success: true });
});

const controllerGetUser = asyncHandler(async (req, res) => {
	const subscribed = Boolean(await Newsletter.exists({ email: req.user.email, status: "active" }));
	res.status(200).json({ ...req.user, subscribed });
});

const controllerLogoutUser = asyncHandler(async (req, res) => {
	// Auth is a stateless JWT: the client discards the token, so there is nothing to destroy server-side
	res.status(200).json({ success: true });
});

module.exports = {
	controllerAuthLocalRegister,
	controllerAuthLocalLogin,
	controllerResetPassword,
	controllerConfirmReset,
	controllerChangePassword,
	controllerGetUser,
	controllerLogoutUser,
	controllerVerifyEmail,
	controllerResendEmail,
};
