const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const User = require("../../schemas/User.schema");
const Transaction = require("../../schemas/Transaction.schema");
const Notification = require("../../schemas/Notification.schema");

const stripe = require("stripe")(process.env.stripe_key);

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

	if (user?.balance < amount) {
		res.status(400);
		throw new Error("You have insufficient funds to complete the transaction");
	}

	const session = await mongoose.startSession();
	session.startTransaction();
	const options = { session };
	// Update balance
	await User.updateOne({ _id: userId }, { $set: { activated: true }, $inc: { balance: -amount } }, options);
	// Conplete the withdrawal
	await Transaction.create({ type: "withdraw", amount: amount, status: "completed", desc: "Withdrawal from account", user: userId, address });
	// await Notification.create({ link: "/account/transactions", user: userId, desc: "Your withdrawal request has been received. Request should be complete within 1-3 days" });
	await Notification.create({
		link: "/account/transactions",
		user: userId,
		desc: `Your withdrawal request of GH₵${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} was successful...`,
	});

	await session.commitTransaction();
	session.endSession();
	res.status(200).json({ success: true });
});

const controllerGenerateCheckoutSession = asyncHandler(async (req, res) => {
	const { amount } = req.body;

	const session = await stripe.checkout.sessions.create({
		payment_method_types: ["card"],
		line_items: [
			{
				price_data: {
					currency: "usd",
					product_data: {
						name: `Deposit of funds`,
						description: `User is depositing such amount into his wallet on mafo.il`,
					},
					unit_amount: 100 * amount, // Amount in cents
				},
				quantity: 1,
			},
		],
		mode: "payment",
		// {CHECKOUT_SESSION_ID} is a template for getting the session_id
		success_url: `${process.env.CLIENT_URL}/account/transactions?status=deposit&session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${process.env.CLIENT_URL}/account/transactions?status=error`,
	});

	// Store session.id so that it can be retrieved later for verification

	res.json({ url: session.url });
});

const controllerValidateCheckoutSession = asyncHandler(async (req, res) => {
	// retrieve the session.id
	await Transaction.updateMany({ status: "success" }, { $set: { status: "completed" } });
	const { sessionId } = req.body;
	const session = await stripe.checkout.sessions.retrieve(sessionId);

	if (session.payment_status === "paid") {
		// Check if sess;ion has been used
		const exists = await Transaction.findOne({ session: sessionId });
		if (exists) {
			res.status(401);
			throw new Error("This session has already been recorded");
		}
		// Update as needed
		let { amount_total: amount } = session;
		amount = amount / 100;
		await Transaction.create({
			amount: amount * 12.78,
			desc: `Deposit of $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} into wallet`,
			status: "completed",
			type: "deposit",
			session: sessionId,
			user: req.session.user._id,
		});
		// Update balance
		// Convert dollars to cedis by multiplying by 12.78
		await User.updateOne({ _id: req.session.user._id }, { $inc: { balance: amount * 12.78 } });
		// Add notification
		await Notification.create({
			link: "/account/transactions",
			user: req.session.user._id,
			desc: `Your deposit of $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} was successful`,
		});
	} else {
		res.status(400).json({ error: "The session was not completed since user didn't make payment" });
	}
	res.status(200).json({ message: "Validation was successful" });
});

module.exports = {
	controllerGetUser,
	controllerUpdateUserData,
	controllerUpdateUserPassword,
	controllerDeleteAccount,
	controllerUpdateNewsLetterSubscription,
	controllerActivateAccount,
	controllerWithdrawFunds,
	controllerGenerateCheckoutSession,
	controllerValidateCheckoutSession,
};
