const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const User = require("../../schemas/User.schema");
const Transaction = require("../../schemas/Transaction.schema");
const Notification = require("../../schemas/Notification.schema");

const controllerGetUser = asyncHandler(async (req, res) => {
	res.status(200).json(req?.session.user);
});

const controllerUpdateUserData = asyncHandler(async (req, res) => {
	let userId = req.session.user._id;
	let { fullname } = req.body;
	if (!fullname) {
		res.status(400);
		throw new Error("Please provide all information");
	}
	// Update user
	await User.updateOne({ _id: userId }, { $set: { fullname } });

	res.status(200).json({ success: true });
});

const controllerUpdateUserPassword = asyncHandler(async (req, res) => {
	let { oldpassword, newpassword } = req.body;
	if (!oldpassword || !newpassword) {
		res.status(400);
		throw new Error("Please provide all information");
	}

	const user = await User.findOne({ _id: req.session.user._id });

	// Check password
	let valid = await user.comparePassword(oldpassword);
	if (!valid) {
		res.status(400);
		throw new Error("The provided password is incorrect");
	}

	// Update user's password
	await user.updatePassword(newpassword);
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

const controllerActivateAccount = asyncHandler(async (req, res) => {
	let userId = req.session.user._id;

	const user = await User.findOne({ _id: userId });
	// Check if user has already activated their account
	if (user.activated) {
		res.status(400);
		throw new Error("User has already activated their account");
	}

	if (user?.balance < 40) {
		res.status(400);
		throw new Error("You have insufficient funds to activate your account");
	}

	const session = await mongoose.startSession();
	try {
		session.startTransaction();
		const options = { session };
		// Update balance
		await User.updateOne({ _id: userId }, { $set: { activated: true }, $inc: { balance: -40 } }, options);
		await Transaction.create([{ type: "withdraw", amount: 40.0, status: "completed", desc: "Account activation fee", user: userId }], options);
		await Notification.create([{ link: "/account", user: userId, desc: "Your account has been activated successfully." }], options);
		if (user?.referrer) {
			// Update referrer's balance
			// Insert notification to tell referrer that they received money
			// Insert a transactions
			await User.updateOne({ _id: user?.referrer._id }, { $inc: { balance: 3 } }, options);
			await Transaction.create({ type: "withdraw", amount: 3.0, status: "completed", desc: "Referral's account activated", user: user?.referrer._id });
			await Notification.create({ link: "/account", user: user?.referrer._id, desc: "You received $3 from your referral's account activation" });
		}
		await session.commitTransaction();
		session.endSession();
	} catch (e) {
		await session.abortTransaction();
		session.endSession();
		res.status(400);
		throw new Error("An error occurred while activating account");
	}
	res.status(200).json({ success: true });
});

const controllerWithdrawFunds = asyncHandler(async (req, res) => {
	let userId = req.session.user._id;
	const { amount, address } = req.body;
	if (typeof amount !== "number") {
		res.status(400);
		throw new Error("Please provide a valid amount");
	}
	if (!amount || !address) {
		res.status(400);
		throw new Error("");
	}
	const user = await User.findOne({ _id: userId });

	if (user?.balance < 40) {
		res.status(400);
		throw new Error("You have insufficient funds to complete the transaction");
	}

	const session = await mongoose.startSession();
	session.startTransaction();
	const options = { session };
	// Update balance
	await User.updateOne({ _id: userId }, { $set: { activated: true }, $inc: { balance: -amount } }, options);
	await Transaction.create({ type: "withdraw", amount: amount, status: "pending", desc: "Withdrawal from account", user: userId, address });
	await Notification.create({ link: "/account/transactions", user: userId, desc: "Your withdrawal request has been received. Request should be complete within 1-3 days" });
	await session.commitTransaction();
	session.endSession();
	res.status(200).json({ success: true });
});

module.exports = {
	controllerGetUser,
	controllerUpdateUserData,
	controllerUpdateUserPassword,
	controllerDeleteAccount,
	controllerUpdateNewsLetterSubscription,
	controllerActivateAccount,
	controllerWithdrawFunds,
};
