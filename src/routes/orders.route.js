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

function createPercentage(createdAt, endDate) {
	let today = new Date().getTime();
	let createdAtTime = new Date(createdAt).getTime();
	let endTime = new Date(endDate).getTime();
	let percent = ((today - createdAtTime) / (endTime - createdAtTime)) * 100;
	percent = Math.round(percent * 100) / 100;

	return percent;
}
const getOrders = asyncHandler(async (req, res) => {
	let { filter } = req.query;
	filter = filter ? filter : "all";

	let obj = { user: req.session.user._id };
	if (filter !== "all") {
		obj = { ...obj, status: filter };
	}

	let orders = await Order.find(obj).sort({ createdAt: -1 });
	orders = orders.map((order) => {
		const { status, totalProfit, totalPrice, avgProfitPercent, createdAt, _id } = order;
		return { status, totalPrice, totalProfit, avgProfitPercent, createdAt, _id };
	});
	res.status(200).json(orders);
});

const getAllOrders = asyncHandler(async (req, res) => {
	let { filter } = req.query;
	filter = filter ? filter : "all";

	let obj = {};
	if (filter !== "all") {
		obj = { ...obj, status: filter };
	}

	let orders = await Order.find(obj).sort({ createdAt: -1 });
	orders = orders.map((order) => {
		const { status, totalProfit, totalPrice, avgProfitPercent, createdAt, _id } = order;
		return { status, totalPrice, totalProfit, avgProfitPercent, createdAt, _id };
	});
	res.status(200).json(orders);
});

const getAnOrder = asyncHandler(async (req, res) => {
	const { orderId } = req.params;

	let order = await Order.findOne({ _id: orderId }).sort({ createdAt: 1 });
	let { totalPrice, totalProfit, avgProfitPercent, status, cart: cartItems, createdAt, endDate } = order;

	const percent = createPercentage(createdAt, endDate);

	cartItems = await Promise.all(
		cartItems.map(async (cart) => {
			let { itemId, count, totalItemsProfit, profitPercent, price } = cart;
			let data = await Product.findOne({ _id: cart?.itemId }, { name: 1, images: 1 });
			let { name, images } = data;
			return { count, totalItemsProfit, profitPercent, price, name, image: images[0], _id: itemId };
		})
	);
	let step = percent < 10 ? 1 : percent < 35 ? 2 : percent < 70 ? 3 : percent < 100 ? 4 : 5;

	res.status(200).json({ cart: cartItems, totalPrice, totalProfit, avgProfitPercent, status, step });
});

const cancelAnOrder = asyncHandler(async (req, res) => {
	const order = await Order.findOne({ _id: req.params.orderId });

	if (!order) {
		res.status(404);
		throw new Error("Order was not found");
	}
	if (order.status !== "pending") {
		res.status(404);
		throw new Error("Finalized orders cannot be canceled");
	}

	if (!order.user.equals(req.session.user._id)) {
		res.status(404);
		throw new Error("User is not authorized to perform this action");
	}

	const percent = createPercentage(order?.createdAt, order?.endDate);
	if (percent > 10) {
		res.status(404);
		throw new Error("Order cannot be cancelled. The specified time for refund has elapsed");
	}

	// Cancel order

	const session = await mongoose.startSession();
	try {
		session.startTransaction();
		const options = { session };
		// Update balance
		await Order.updateOne({ _id: req.params.orderId }, { $set: { status: "cancelled" } }, options);
		// Add new balance
		await User.updateOne({ _id: order?.user }, { $inc: { balance: order?.totalPrice } });
		// Add a transaction and notification for refund
		await Transaction.create({ type: "deposit", status: "complete", amount: order?.totalPrice, desc: "Order cancellation", user: req.session.user._id });
		await Notification.create({ link: `/orders/${order?._id}`, desc: "Your order has been refunded", user: req.session.user._id });
		await session.commitTransaction();
		session.endSession();
		res.status(200).json({ success: true });
	} catch (e) {
		await session.abortTransaction();
		session.endSession();
		res.status(400);
		throw new Error("An error occurred while cancelling order");
	}
});
ordersRouter.get("/", user, getOrders);
ordersRouter.get("/admin", user, admin, getAllOrders);
ordersRouter.get("/:orderId", user, getAnOrder);
ordersRouter.get("/cancel/:orderId", user, cancelAnOrder);
// ordersRouter.post("/", user, insertUserCart);

module.exports = ordersRouter;
