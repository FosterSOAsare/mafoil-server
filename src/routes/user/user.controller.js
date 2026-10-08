const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const User = require("../../schemas/User.schema");
const Transaction = require("../../schemas/Transaction.schema");
const Notification = require("../../schemas/Notification.schema");
const HttpError = require("../../utils/http-error");
const { roundMoney, isPositiveAmount } = require("../../utils/money");

const ACTIVATION_FEE = 40;
const REFERRAL_BONUS = 3;
const USD_TO_GHS = 12.78;

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
	const userId = req.session.user._id;

	await mongoose.connection.transaction(async (session) => {
		// Charge the fee and activate in one atomic update, so concurrent requests cannot both succeed
		const user = await User.findOneAndUpdate(
			{ _id: userId, activated: false, balance: { $gte: ACTIVATION_FEE } },
			{ $set: { activated: true }, $inc: { balance: -ACTIVATION_FEE } },
			{ session }
		);
		if (!user) {
			const current = await User.findOne({ _id: userId }, { activated: 1 }, { session });
			throw new HttpError(400, current?.activated ? "User has already activated their account" : "You have insufficient funds to activate your account");
		}

		await Transaction.create([{ type: "withdraw", amount: ACTIVATION_FEE, status: "completed", desc: "Account activation fee", user: userId }], { session });
		await Notification.create([{ link: "/account", user: userId, desc: "Your account has been activated successfully." }], { session });

		if (user.referrer) {
			// Credit the referrer as part of the same transaction
			await User.updateOne({ _id: user.referrer }, { $inc: { balance: REFERRAL_BONUS } }, { session });
			await Transaction.create([{ type: "deposit", amount: REFERRAL_BONUS, status: "completed", desc: "Referral's account activated", user: user.referrer }], { session });
			await Notification.create([{ link: "/account", user: user.referrer, desc: `You received GH₵${REFERRAL_BONUS} from your referral's account activation` }], { session });
		}
	});

	res.status(200).json({ success: true });
});

const controllerWithdrawFunds = asyncHandler(async (req, res) => {
	const userId = req.session.user._id;
	let { amount, address } = req.body;

	if (!isPositiveAmount(amount) || roundMoney(amount) < 0.01) {
		res.status(400);
		throw new Error("Please provide a valid amount");
	}
	if (typeof address !== "string" || !address.trim() || address.length > 200) {
		res.status(400);
		throw new Error("Please provide a valid withdrawal address");
	}
	amount = roundMoney(amount);
	address = address.trim();

	await mongoose.connection.transaction(async (session) => {
		// Only deduct when the balance covers the amount, in one atomic update (no check-then-write race)
		const result = await User.updateOne({ _id: userId, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { session });
		if (result.modifiedCount !== 1) {
			throw new HttpError(400, "You have insufficient funds to complete the transaction");
		}

		await Transaction.create([{ type: "withdraw", amount, status: "completed", desc: "Withdrawal from account", user: userId, address }], { session });
		await Notification.create(
			[
				{
					link: "/account/transactions",
					user: userId,
					desc: `Your withdrawal request of GH₵${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} was successful...`,
				},
			],
			{ session }
		);
	});

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
	const userId = req.session.user._id;
	const { sessionId } = req.body;
	if (typeof sessionId !== "string" || !sessionId) {
		res.status(400);
		throw new Error("Please provide a valid checkout session");
	}

	const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
	if (checkoutSession.payment_status !== "paid") {
		res.status(400);
		throw new Error("The session was not completed since user didn't make payment");
	}

	const usdAmount = checkoutSession.amount_total / 100;
	const amount = roundMoney(usdAmount * USD_TO_GHS); // Convert dollars to cedis
	const usdLabel = usdAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	try {
		await mongoose.connection.transaction(async (session) => {
			// The unique index on Transaction.session makes a second claim of the same session fail here
			await Transaction.create([{ amount, desc: `Deposit of $${usdLabel} into wallet`, status: "completed", type: "deposit", session: sessionId, user: userId }], { session });
			await User.updateOne({ _id: userId }, { $inc: { balance: amount } }, { session });
			await Notification.create([{ link: "/account/transactions", user: userId, desc: `Your deposit of $${usdLabel} was successful` }], { session });
		});
	} catch (e) {
		if (e?.code === 11000) throw new HttpError(409, "This session has already been recorded");
		throw e;
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
