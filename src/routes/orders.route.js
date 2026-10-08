const express = require("express");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const user = require("../middlewares/user.middleware");
const admin = require("../middlewares/admin.middleware");

const Product = require("../schemas/Products.schema");
const Order = require("../schemas/Order.schema");
const User = require("../schemas/User.schema");
const ordersRouter = express.Router();
const Transaction = require("../schemas/Transaction.schema");
const Notification = require("../schemas/Notification.schema");
const HttpError = require("../utils/http-error");
const { getPagination } = require("../utils/validate");

const ORDER_STATUSES = ["pending", "completed", "cancelled"];
// Only known statuses filter the list; anything else (including "all") lists every status
const statusFilter = (filter) => (ORDER_STATUSES.includes(filter) ? { status: filter } : {});
const summarize = ({ status, totalProfit, totalPrice, avgProfitPercent, createdAt, _id }) => ({ status, totalPrice, totalProfit, avgProfitPercent, createdAt, _id });

function createPercentage(createdAt, endDate) {
	let today = new Date().getTime();
	let createdAtTime = new Date(createdAt).getTime();
	let endTime = new Date(endDate).getTime();
	let percent = ((today - createdAtTime) / (endTime - createdAtTime)) * 100;
	percent = Math.round(percent * 100) / 100;

	return percent;
}
const getOrders = asyncHandler(async (req, res) => {
	const { limit, skip } = getPagination(req.query, { defaultLimit: 20 });
	const orders = await Order.find({ user: req.user._id, ...statusFilter(req.query.filter) })
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit);
	res.status(200).json(orders.map(summarize));
});

const getAllOrders = asyncHandler(async (req, res) => {
	const { limit, skip } = getPagination(req.query);
	const orders = await Order.find(statusFilter(req.query.filter)).sort({ createdAt: -1 }).skip(skip).limit(limit);
	res.status(200).json(orders.map(summarize));
});

const getAnOrder = asyncHandler(async (req, res) => {
	const { orderId } = req.params;
	if (!mongoose.isValidObjectId(orderId)) {
		res.status(404);
		throw new Error("Order was not found");
	}

	// Users can only see their own orders; admins can see any order
	const filter = req.user.is_admin ? { _id: orderId } : { _id: orderId, user: req.user._id };
	let order = await Order.findOne(filter);
	if (!order) {
		res.status(404);
		throw new Error("Order was not found");
	}
	let { totalPrice, totalProfit, avgProfitPercent, status, cart: cartItems, createdAt, endDate } = order;

	const percent = createPercentage(createdAt, endDate);

	// One query for all products in the order
	const products = await Product.find({ _id: { $in: cartItems.map((item) => item.itemId) } }, { name: 1, images: 1 });
	const productsById = new Map(products.map((product) => [product._id.toString(), product]));
	cartItems = cartItems.map(({ itemId, count, totalItemsProfit, profitPercent, price }) => {
		const data = productsById.get(itemId?.toString());
		// The product may have been deleted since the order was placed
		return { count, totalItemsProfit, profitPercent, price, name: data?.name || "Product no longer available", image: data?.images?.[0], _id: itemId };
	});
	let step = percent < 10 ? 1 : percent < 35 ? 2 : percent < 70 ? 3 : percent < 100 ? 4 : 5;

	res.status(200).json({ cart: cartItems, totalPrice, totalProfit, avgProfitPercent, status, step });
});

const cancelAnOrder = asyncHandler(async (req, res) => {
	const { orderId } = req.params;
	const userId = req.user._id;
	if (!mongoose.isValidObjectId(orderId)) {
		res.status(404);
		throw new Error("Order was not found");
	}

	// Only the owner's orders are visible here
	const order = await Order.findOne({ _id: orderId, user: userId });
	if (!order) {
		res.status(404);
		throw new Error("Order was not found");
	}
	if (order.status !== "pending") {
		res.status(400);
		throw new Error("Finalized orders cannot be canceled");
	}

	const percent = createPercentage(order.createdAt, order.endDate);
	if (percent > 10) {
		res.status(400);
		throw new Error("Order cannot be cancelled. The specified time for refund has elapsed");
	}

	await mongoose.connection.transaction(async (session) => {
		// Flip pending -> cancelled atomically, so the order can only be refunded once
		const cancelled = await Order.findOneAndUpdate({ _id: orderId, user: userId, status: "pending" }, { $set: { status: "cancelled" } }, { session, new: true });
		if (!cancelled) {
			throw new HttpError(409, "This order has already been finalized or cancelled");
		}

		await User.updateOne({ _id: userId }, { $inc: { balance: cancelled.totalPrice } }, { session });
		await Transaction.create([{ type: "deposit", status: "completed", amount: cancelled.totalPrice, desc: "Order cancellation", user: userId }], { session });
		await Notification.create([{ link: `/orders/${cancelled._id}`, desc: "Your order has been refunded", user: userId }], { session });
	});

	res.status(200).json({ success: true });
});
ordersRouter.get("/", user, getOrders);
ordersRouter.get("/admin", user, admin, getAllOrders);
ordersRouter.get("/:orderId", user, getAnOrder);
ordersRouter.post("/cancel/:orderId", user, cancelAnOrder);
// ordersRouter.post("/", user, insertUserCart);

module.exports = ordersRouter;
