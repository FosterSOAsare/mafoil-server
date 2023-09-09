const asyncHandler = require("express-async-handler");
const User = require("../../schemas/User.schema");

const controllerGetUser = asyncHandler(async (req, res) => {
	res.status(200).json(req?.session.user);
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
	await User.deleteOne({ _id: req.session.user._id });
	res.status(200).json({ success: true });
});

module.exports = {
	controllerGetUser,
	controllerUpdateUserData,
	controllerUpdateUserPassword,
	controllerDeleteAccount,
	controllerUpdateNewsLetterSubscription,
};
