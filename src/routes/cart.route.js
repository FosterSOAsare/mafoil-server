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

const HttpError = require("../utils/http-error");
const { roundMoney } = require("../utils/money");

const MAX_ITEM_COUNT = 99;
const MAX_CART_ITEMS = 100;

const isValidCount = (count) => Number.isInteger(count) && count >= 1 && count <= MAX_ITEM_COUNT;

// Returns the cart's products with their counts. Products that no longer exist are dropped.
async function getPopulatedCart(userId, session) {
	const cart = await Cart.findOne({ user: userId }, null, { session });
	const items = cart?.cart || [];
	const products = await Product.find({ _id: { $in: items.map((item) => item.itemId) } }, null, { session });
	const productsById = new Map(products.map((product) => [product._id.toString(), product]));

	const populatedCart = items
		.filter((item) => productsById.has(item.itemId?.toString()))
		.map((item) => ({ ...productsById.get(item.itemId.toString())._doc, count: item.count }));
	return { cart, populatedCart };
}

const getUserCart = asyncHandler(async (req, res) => {
	const { populatedCart } = await getPopulatedCart(req.session.user._id);
	res.status(200).json(populatedCart);
});

const insertUserCart = asyncHandler(async (req, res) => {
	let { cart: cartData } = req.body;
	const userId = req.session.user._id;

	if (!Array.isArray(cartData)) {
		res.status(400);
		throw new Error("Please include a cart to the request");
	}
	const valid =
		cartData.length <= MAX_CART_ITEMS &&
		cartData.every((item) => item && typeof item === "object" && mongoose.isValidObjectId(item.id) && isValidCount(item.count));
	if (!valid) {
		res.status(400);
		throw new Error(`Please include a valid cart. Each item needs a product id and a whole-number count between 1 and ${MAX_ITEM_COUNT}`);
	}

	cartData = cartData.map((item) => ({ itemId: item.id, count: item.count }));
	await Cart.updateOne({ user: userId }, { $set: { cart: cartData } }, { upsert: true });
	res.status(200).json({ success: true });
});

const checkoutCart = asyncHandler(async (req, res) => {
	const userId = req.session.user._id;
	let order;
	let totalPrice;

	await mongoose.connection.transaction(async (session) => {
		const user = await User.findOne({ _id: userId }, { activated: 1 }, { session });
		if (!user?.activated) {
			throw new HttpError(400, "Your account has not been activated. Please activate account and try again.");
		}

		const { cart, populatedCart } = await getPopulatedCart(userId, session);
		if (populatedCart.length === 0) {
			throw new HttpError(400, "Your cart has no items");
		}
		// Re-check counts in case an invalid cart was stored before validation existed
		if (!populatedCart.every((item) => isValidCount(item.count) && item.price > 0)) {
			throw new HttpError(400, "Your cart contains invalid items. Please update your cart and try again.");
		}

		const totalDays = Math.floor(Math.random() * 3) + 3;
		const endDate = new Date().getTime() + totalDays * (3600 * 24 * 1000);

		const cartData = populatedCart.map((cartItem) => {
			const { _id, price, count } = cartItem;
			// Profit percent is between 5% - 7%
			const profitPercent = Math.floor(Math.random() * 3) + 5;
			const totalItemsProfit = roundMoney((profitPercent / 100) * price * count);
			return { itemId: _id, totalItemsProfit, profitPercent, count, price };
		});
		totalPrice = roundMoney(cartData.reduce((total, item) => total + item.price * item.count, 0));
		const totalProfit = roundMoney(cartData.reduce((total, item) => total + item.totalItemsProfit, 0));
		const avgProfitPercent = roundMoney((totalProfit / totalPrice) * 100);

		// Deleting this exact cart inside the transaction means a cart can only be paid for once
		const deleted = await Cart.deleteOne({ _id: cart._id }, { session });
		if (deleted.deletedCount !== 1) {
			throw new HttpError(409, "This cart has already been checked out");
		}

		// Deduct only when the balance covers the total, in one atomic update
		const debit = await User.updateOne({ _id: userId, balance: { $gte: totalPrice } }, { $inc: { balance: -totalPrice } }, { session });
		if (debit.modifiedCount !== 1) {
			throw new HttpError(400, "Balance is insufficient to complete purchase");
		}

		[order] = await Order.create([{ cart: cartData, endDate, totalPrice, totalProfit, avgProfitPercent, status: "pending", user: userId }], { session });
		await Transaction.create([{ type: "withdraw", amount: totalPrice, status: "completed", desc: "Cart checkout payment", user: userId }], { session });
		await Notification.create([{ link: `/orders/${order._id}`, user: userId, desc: "Your cart has been successfully checked out." }], { session });
	});

	res.status(200).json({ total: totalPrice, success: true });
});

cartRouter.get("/", user, getUserCart);
cartRouter.get("/checkout", user, checkoutCart);
cartRouter.post("/", user, insertUserCart);

module.exports = cartRouter;
