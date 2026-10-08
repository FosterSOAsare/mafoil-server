const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const User = require("../../schemas/User.schema");
const Transaction = require("../../schemas/Transaction.schema");
const Notification = require("../../schemas/Notification.schema");
const Newsletter = require("../../schemas/Newsletter.schema");
const Cart = require("../../schemas/Cart.schema");
const WishList = require("../../schemas/Wishlist.schema");
const Review = require("../../schemas/Reviews.schema");
const Order = require("../../schemas/Order.schema");
const { isNonEmptyString, isValidPassword, PASSWORD_RULE } = require("../../utils/validate");
const { signToken } = require("../../libs/auth-token");
const HttpError = require("../../utils/http-error");
const { roundMoney, isPositiveAmount } = require("../../utils/money");

const ACTIVATION_FEE = 40;
const REFERRAL_BONUS = 3;
const USD_TO_GHS = 12.78;
const MIN_DEPOSIT_USD = 1;
const MAX_DEPOSIT_USD = 10000;

const stripe = require("stripe")(process.env.STRIPE_KEY || process.env.stripe_key);

const controllerGetUser = asyncHandler(async (req, res) => {
	const subscribed = Boolean(await Newsletter.exists({ email: req.user.email, status: "active" }));
	res.status(200).json({ ...req.user, subscribed });
});

const controllerUpdateUserData = asyncHandler(async (req, res) => {
	let userId = req.user._id;
	let { fullname } = req.body;
	if (!isNonEmptyString(fullname, 100) || fullname.trim().length < 3) {
		res.status(400);
		throw new Error("Please provide your full name (3 to 100 characters)");
	}
	// Update user
	await User.updateOne({ _id: userId }, { $set: { fullname: fullname.trim() } });

	res.status(200).json({ success: true });
});

const controllerUpdateUserPassword = asyncHandler(async (req, res) => {
	let { oldpassword, newpassword } = req.body;
	if (typeof oldpassword !== "string" || !oldpassword) {
		res.status(400);
		throw new Error("Please provide your current password");
	}
	if (!isValidPassword(newpassword)) {
		res.status(400);
		throw new Error(PASSWORD_RULE);
	}

	const user = await User.findOne({ _id: req.user._id });

	// Check password
	let valid = await user.comparePassword(oldpassword);
	if (!valid) {
		res.status(400);
		throw new Error("The provided password is incorrect");
	}

	// Update user's password. This logs out every existing session, so send this device a fresh token
	await user.updatePassword(newpassword);
	await user.save();

	res.status(200).json({ success: true, token: signToken(user) });
});

const controllerUpdateNewsLetterSubscription = asyncHandler(async (req, res) => {
	// Stored in the Newsletter collection (User has no newsletter field, so the old update did nothing)
	const subscribed = req.body.subscription === true;
	await Newsletter.updateOne({ email: req.user.email.toLowerCase() }, { $set: { status: subscribed ? "active" : "inactive" } }, { upsert: true });
	res.status(200).json({ success: true });
});

const controllerDeleteAccount = asyncHandler(async (req, res) => {
	const userId = req.user._id;
	const { password } = req.body;
	if (typeof password !== "string" || !password) {
		res.status(400);
		throw new Error("Please enter your password to delete your account");
	}
	const account = await User.findOne({ _id: userId });
	if (!(await account.comparePassword(password))) {
		res.status(400);
		throw new Error("The provided password is incorrect");
	}

	// Don't let money disappear with the account
	if (account.balance > 0) {
		res.status(409);
		throw new Error("Please withdraw your remaining balance before deleting your account");
	}
	if ((await Order.exists({ user: userId, status: "pending" })) || (await Transaction.exists({ user: userId, status: "pending" }))) {
		res.status(409);
		throw new Error("Please wait for your pending orders and withdrawals to finish before deleting your account");
	}

	await mongoose.connection.transaction(async (session) => {
		await User.deleteOne({ _id: userId }, { session });
		await Cart.deleteOne({ user: userId }, { session });
		await WishList.deleteOne({ user: userId }, { session });
		await Notification.deleteMany({ user: userId }, { session });
		await Newsletter.deleteOne({ email: account.email }, { session });
		// Orders and transactions stay for the accounting records, without personal details
		await Transaction.updateMany({ user: userId }, { $unset: { address: "" } }, { session });
		// Published reviews stay on the product, anonymised
		await Review.updateMany({ user: userId }, { $set: { name: "Deleted user", email: "deleted@mafo.il" } }, { session });
	});

	res.status(200).json({ success: true });
});

const controllerActivateAccount = asyncHandler(async (req, res) => {
	const userId = req.user._id;

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
	const userId = req.user._id;
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

		// The amount is held (deducted) now; an admin approves the payout or rejects it, which refunds it
		await Transaction.create([{ type: "withdraw", amount, status: "pending", desc: "Withdrawal from account", user: userId, address }], { session });
		await Notification.create(
			[
				{
					link: "/account/transactions",
					user: userId,
					desc: `Your withdrawal request of GH₵${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been received and is awaiting approval.`,
				},
			],
			{ session }
		);
	});

	res.status(200).json({ success: true });
});

const controllerGenerateCheckoutSession = asyncHandler(async (req, res) => {
	const { amount } = req.body;
	// Whole cents only, within the allowed range
	if (!isPositiveAmount(amount) || amount < MIN_DEPOSIT_USD || amount > MAX_DEPOSIT_USD || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
		res.status(400);
		throw new Error(`Please enter an amount between $${MIN_DEPOSIT_USD} and $${MAX_DEPOSIT_USD.toLocaleString("en-US")} with at most 2 decimal places`);
	}

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
					unit_amount: Math.round(amount * 100), // Amount in cents
				},
				quantity: 1,
			},
		],
		mode: "payment",
		// Ties the session to this user so nobody else can claim the payment
		client_reference_id: req.user._id.toString(),
		// {CHECKOUT_SESSION_ID} is a template for getting the session_id
		success_url: `${process.env.CLIENT_URL}/account/transactions?status=deposit&session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${process.env.CLIENT_URL}/account/transactions?status=error`,
	});

	res.json({ url: session.url });
});

const controllerValidateCheckoutSession = asyncHandler(async (req, res) => {
	const userId = req.user._id;
	const { sessionId } = req.body;
	if (typeof sessionId !== "string" || !sessionId) {
		res.status(400);
		throw new Error("Please provide a valid checkout session");
	}

	const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
	if (checkoutSession.client_reference_id !== userId.toString()) {
		res.status(403);
		throw new Error("This checkout session does not belong to your account");
	}
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
