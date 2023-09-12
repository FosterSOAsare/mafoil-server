const asyncHandler = require("express-async-handler");
const User = require("../../schemas/User.schema");
const generateCode = require("../../utils/generateCode");
const { sendPasswordResetEmail, sendEmailVerificationEmail } = require("../../libs/nodemailer");

const controllerVerificationEmail = asyncHandler(async (user, fn) => {
	let code = generateCode();
	await fn(user.email, code);
	await user.storeCode(code);
	user = await user.save();
	return user;
});

const controllerAuthLocalLogin = asyncHandler(async (req, res) => {
	const { email, password } = req.body;
	// Check if user exists , if no , throw an error else set a session
	let user = await User.findOne({ email: email.toLowerCase() });

	if (!user) {
		res.status(400);
		throw new Error("User does not exist");
	}

	// Check user's password
	let valid = await user.comparePassword(password);
	if (!valid) {
		res.status(400);
		throw new Error("Invalid login credentials. Please check your password and try again");
	}
	// Check if user's email is verified , if not send verification email and throw an unverified email error
	if (!user.verified) {
		user = await controllerVerificationEmail(user, sendEmailVerificationEmail);
		res.status(401);
		throw new Error("Email is not verified , redirecting you to verify your email address");
	}

	req.session.user = { email: user.email, id: user._id, balance: user?.balance, subscribed: user?.subscribed, fullname: user?.fullname };
	req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
	res.status(200).json(req.session.user);
});
const controllerAuthLocalRegister = asyncHandler(async (req, res) => {
	let { email, password, fullname } = req.body;

	if (!email || !password || !fullname) {
		throw new Error("Please provide all  credentials");
		res.status(400);
	}
	// Check if the user already exists
	let user = await User.findOne({ email: email.toLowerCase() });
	if (user) {
		res.status(400);
		throw new Error("User already exists , please sign in");
	}
	// Create new user
	user = new User({ email: email.toLowerCase(), password: password, fullname: fullname, verified: false });

	// Send email for verification , set code and save user
	user = await controllerVerificationEmail(user, sendEmailVerificationEmail);

	let { _id } = user;
	res.status(200).json({ email, _id });
});

const verifyAuth = asyncHandler(async (req, res) => {
	res.status(200).json(req?.session?.user);
});

const controllerResetPassword = asyncHandler(async (req, res) => {
	let { email } = req.body;
	if (!email) {
		res.status(400);
		throw new Error("Please fill in all credentials");
	}
	// Find account
	let account = await User.findOne({ email: email.toLowerCase() });
	if (!account) {
		res.status(404);
		throw new Error("Account does not exist");
	}
	if (!account.verified) {
		res.status(401);
		throw new Error("Email is not verified hence password cannot be reset. Please contact support for guidance");
	}
	await controllerVerificationEmail(account, sendPasswordResetEmail);
	// Return success
	res.status(200).json({ success: true });
});

const controllerChangePassword = asyncHandler(async (req, res) => {
	let { email, password, newPassword } = req.body;
	if (!email || !newPassword || !password) {
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
	if (!email || !code || !mode) {
		res.status(401);
		throw new Error("Email verificaton was unsuccessful");
	}
	if (mode !== "accountverification" && mode !== "resetpassword") {
		res.status(400);
		throw new Error("The provided credentials are invalid");
	}

	// Find user by email
	let user = await User.findOne({ email: email.toLowerCase() });
	if (!user) {
		res.status(400);
		throw new Error("User account not found");
	}
	if (!user.code && mode === "resetpassword") {
		res.status(404);
		throw new Error("The verification code has been used , request a new one through forgot password");
	}

	// Check if user is already verified
	if (!user.verified || mode.toLowerCase() === "resetpassword") {
		let valid = await user.compareCode(code);
		if (!valid) {
			res.status(400);
			throw new Error("The provided code is invalid");
		}
	}
	if (mode.toLowerCase() === "resetpassword") {
		res.status(200).json({ code: user.code });
		return;
	}
	// Update verification status
	await User.updateOne({ email: email.toLowerCase() }, { $set: { verified: true }, $unset: { code: null } });

	res.status(200).json({ success: true });
});
const controllerConfirmReset = asyncHandler(async (req, res) => {
	let { email, code, newPassword } = req.body;
	if (!email || !code || !newPassword) {
		res.status(401);
		throw new Error("Email verificaton was unsuccessful");
	}

	// Find user by email
	let user = await User.findOne({ email: email.toLowerCase() });
	if (!user) {
		res.status(400);
		throw new Error("Email verificaton was unsuccessful");
	}

	// Confirm code
	let valid = code === user.code;
	if (!valid) {
		res.status(400);
		throw new Error("Invalid code");
	}
	// Update password
	await user.updatePassword(newPassword);
	await user.save();

	res.status(200).json({ success: true });
});

const controllerResendEmail = asyncHandler(async (req, res) => {
	let { email, mode } = req.body;
	if (!email || !mode) {
		res.status(400);
		throw new Error("Please fill in all credentials");
	}
	if (mode !== "accountverification" && mode !== "resetpassword") {
		res.status(400);
		throw new Error("The provided credentials are invalid");
	}

	let account = await User.findOne({ email: email.toLowerCase() });
	if (!account) {
		res.status(404);
		throw new Error("Account does not exist");
	}

	await controllerVerificationEmail(account, mode === "accountverification" ? sendEmailVerificationEmail : sendPasswordResetEmail);
	res.status(200).json({ success: true });
});

const controllerGetUser = asyncHandler(async (req, res) => {
	res.status(200).json(req?.session.user);
});

const controllerLogoutUser = asyncHandler(async (req, res) => {
	if (req.session) {
		let response = await req.session.destroy();
		res.status(200).json({ success: true });
	}
});

const controllerUpdateUserData = asyncHandler(async (req, res) => {
	let userId = req.session.user._id;
	let { firstname, lastname } = req.body;
	if (!firstname || !lastname) {
		res.status(400);
		throw new Error("Please provide all information");
	}
	// Update user
	await User.updateOne({ _id: userId }, { $set: { firstname, lastname } });

	// Update session
	req.session.user = { ...req.session.user, firstname, lastname };
	res.status(200).json({ success: true });
});

const controllerUpdateUserPassword = asyncHandler(async (req, res) => {
	let userId = req.session.user._id;
	let { password, newPassword } = req.body;
	if (!password || !newPassword) {
		res.status(400);
		throw new Error("Please provide all information");
	}

	const user = await User.findOne({ _id: req.session.user._id });

	// Check password
	let valid = await user.comparePassword(password);
	if (!valid) {
		res.status(400);
		throw new Error("The provided password is incorrect");
	}

	// Update user's password
	await user.updatePassword(newPassword);
	await user.save();

	res.status(200).json({ success: true });
});

const controllerUpdateNewsLetterSubscription = asyncHandler(async (req, res) => {
	let { subscription } = req.body;
	if (!subscription) subscription = false;
	await User.updateOne({ _id: req.session.user._id }, { newsletter: subscription });
	res.status(200).json({ success: true });
});

const controllerDeleteAccount = asyncHandler(async (req, res) => {
	// await User.deleteOne({ _id: req.session.user._id });
	res.status(200).json({ success: true });
});

module.exports = {
	verifyAuth,
	controllerAuthLocalRegister,
	controllerAuthLocalLogin,
	controllerResetPassword,
	controllerConfirmReset,
	controllerChangePassword,
	controllerGetUser,
	controllerLogoutUser,
	controllerVerifyEmail,
	controllerResendEmail,
	controllerUpdateUserData,
	controllerUpdateUserPassword,
	controllerDeleteAccount,
};
