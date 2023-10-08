const express = require("express");
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");

const user = require("../middlewares/user.middleware");
const Cart = require("../schemas/Cart.schema");
const Product = require("../schemas/Products.schema");
const Order = require("../schemas/Order.schema");
const User = require("../schemas/User.schema");
const Transaction = require("../schemas/Transaction.schema");
const Notification = require("../schemas/Notification.schema");
const cartRouter = express.Router();

const getPopulatedCart = asyncHandler(async (userId) => {
	let cart = await Cart.findOne({ user: userId });

	cart = cart?.cart ? cart?.cart : [];
	let populatedCart = await Promise.all(
		cart.map((item) => {
			return Product.findOne({ _id: item.itemId });
		})
	);

	// Add the count property
	populatedCart = populatedCart.map((item, index) => ({ ...item?._doc, count: cart[index]?.count }));
	return populatedCart;
});

const getUserCart = asyncHandler(async (req, res) => {
	const userId = req.session.user._id;

	const populatedCart = await getPopulatedCart(userId);
	res.status(200).json(populatedCart);
});
const insertUserCart = asyncHandler(async (req, res) => {
	let { cart: cartData } = req.body;
	const userId = req.session.user._id;

	if (!cartData || !Array.isArray(cartData)) {
		throw new Error("Please include a cart to the request");
	}
	const valid = cartData.every((item) => {
		return item.hasOwnProperty("id") && item.hasOwnProperty("count");
	});
	if (!valid) {
		throw new Error("Please include a valid cart to the request");
	}
	const cart = await Cart.findOne({ user: userId });

	cartData = cartData.map((item) => ({ itemId: item.id, count: item.count }));

	if (cart) {
		// Update cart
		await Cart.updateOne({ _id: cart?._id }, { $set: { cart: cartData } });
	} else {
		await Cart.create({ cart: cartData, user: req.session.user?._id });
	}
	res.status(200).json({ success: true });
});

const checkoutCart = asyncHandler(async (req, res) => {
	const user = await User.findOne({ _id: req.session.user._id });
	if (!user.activated) {
		res.status(400);
		throw new Error("Your account has not been activated. Please activate account and try again.");
	}
	const populatedCart = await getPopulatedCart(req.session.user._id);
	if (populatedCart?.length === 0) {
		res.status(400);
		throw new Error("Your cart has no items");
	}

	let totalDays = Math.floor(Math.random() * 3) + 3;
	let endDate = new Date().getTime() + totalDays * (3600 * 24 * 1000);

	let cartData = populatedCart.map((cartItem) => {
		let { _id, price, count } = cartItem;
		// Profit percent is between 5% - 7%
		let profitPercent = Math.floor(Math.random() * 3) + 5;
		let totalItemsProfit = (profitPercent / 100) * price * count;
		totalItemsProfit = Math.round((totalItemsProfit + Number.EPSILON) * 100) / 100;

		return { itemId: _id, totalItemsProfit, profitPercent, count, price };
	});
	const totalPrice = Math.round(cartData.reduce((total, item) => total + item.price * item.count, 0) * 100) / 100;
	const totalProfit = Math.round(cartData.reduce((total, item) => total + item.totalItemsProfit, 0) * 100) / 100;

	let avgProfitPercent = (totalProfit / totalPrice) * 100;

	if (user.balance < totalPrice) {
		res.status(400);
		throw new Error("Balance is insufficient to complete purchase");
	}

	let response = { cart: cartData, endDate, totalPrice, totalProfit, avgProfitPercent: Math.round((avgProfitPercent + Number.EPSILON) * 100) / 100, status: "pending", user: req.session.user._id };

	let order = await Order.create({ ...response });
	if (!order) {
		res.status(400);
		throw new Error("An error occurred while creating order");
	}
	const session = await mongoose.startSession();
	try {
		session.startTransaction();
		const options = { session };
		// Update balance
		await Transaction.create({ type: "withdraw", amount: totalPrice, status: "completed", desc: "Cart checkout payment", user: req.session.user._id });
		await Notification.create({ link: `/orders/${order._id}`, user: req.session.user._id, desc: "Your cart has been successfully checked out." });

		await User.updateOne({ _id: req.session.user._id }, { $inc: { balance: -totalPrice } }, options);

		// TODO : Insert transaction
		await Cart.deleteOne({ user: req.session.user._id });
		await session.commitTransaction();
		session.endSession();
		res.status(200).json({ total: totalPrice, success: true });
	} catch (e) {
		await session.commitTransaction();
		session.endSession();
		res.status(400);
		throw new Error("An error occurred while checking out cart");
	}
});
cartRouter.get("/", user, getUserCart);
cartRouter.get("/checkout", user, checkoutCart);
cartRouter.post("/", user, insertUserCart);

module.exports = cartRouter;
