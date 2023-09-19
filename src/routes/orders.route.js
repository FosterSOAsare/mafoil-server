const express = require("express");
const asyncHandler = require("express-async-handler");

const user = require("../middlewares/user.middleware");
const Cart = require("../schemas/Cart.schema");
const Product = require("../schemas/Products.schema");
const Order = require("../schemas/Order.schema");
const User = require("../schemas/User.schema");
const ordersRouter = express.Router();

// const getPopulatedOrder = asyncHandler(async (userId) => {
// 	let order = await Order.findOne({ user: userId });

// 	order = order?.cart ? order?.cart : [];
// 	let populatedOrder = await Promise.all(
// 		cart.map((item) => {
// 			return Product.findOne({ _id: item.itemId });
// 		})
// 	);

// 	// Add the count property
// 	populatedOrder = populatedOrder.map((item, index) => ({ ...item?._doc, count: cart[index]?.count }));
// 	return populatedCart;
// });

const getOrders = asyncHandler(async (req, res) => {
	let { filter } = req.query;
	console.log(filter);
	filter = filter ? filter : "all";

	let obj = { user: req.session.user._id };
	if (filter !== "all") {
		obj = { ...obj, status: filter };
	}

	let orders = await Order.find(obj).sort({ createdAt: 1 });
	orders = orders.map((order) => {
		const { endDate, status, totalProfit, totalPrice, avgProfitPercent, createdAt, _id } = order;
		let today = new Date().getTime();
		let createdAtTime = new Date(createdAt).getTime();
		let endTime = new Date(endDate).getTime();
		let percent = ((today - createdAtTime) / (endTime - createdAtTime)) * 100;
		percent = Math.round(percent * 100) / 100;

		return { status, totalPrice, totalProfit, avgProfitPercent, percentComplete: percent, createdAt, _id };
	});
	res.status(200).json(orders);
});

// const getUserCart = asyncHandler(async (req, res) => {
// 	const userId = req.session.user._id;

// 	const populatedCart = await getPopulatedCart(userId);
// 	res.status(200).json(populatedCart);
// });
// const insertUserCart = asyncHandler(async (req, res) => {
// 	let { cart: cartData } = req.body;
// 	const userId = req.session.user._id;

// 	if (!cartData || !Array.isArray(cartData)) {
// 		throw new Error("Please include a cart to the request");
// 	}
// 	const valid = cartData.every((item) => {
// 		return item.hasOwnProperty("id") && item.hasOwnProperty("count");
// 	});
// 	if (!valid) {
// 		throw new Error("Please include a valid cart to the request");
// 	}
// 	const cart = await Cart.findOne({ user: userId });

// 	cartData = cartData.map((item) => ({ itemId: item.id, count: item.count }));

// 	if (cart) {
// 		// Update cart
// 		await Cart.updateOne({ _id: cart?._id }, { $set: { cart: cartData } });
// 	} else {
// 		await Cart.create({ cart: cartData, user: req.session.user?._id });
// 	}
// 	res.status(200).json({ success: true });
// });

// const checkoutCart = asyncHandler(async (req, res) => {
// 	const user = await User.findOne({ _id: req.session.user._id });
// 	if (!user.activated) {
// 		res.status(400);
// 		throw new Error("Your account has not been activated. Please activate account and try again.");
// 	}
// 	const populatedCart = await getPopulatedCart(req.session.user._id);
// 	if (populatedCart?.length === 0) {
// 		res.status(400);
// 		throw new Error("Your cart has no items");
// 	}

// 	let totalDays = Math.floor(Math.random() * 3) + 3;
// 	let endDate = new Date().getTime() + totalDays * (3600 * 24 * 1000);

// 	let cartData = populatedCart.map((cartItem) => {
// 		let { _id, price, count } = cartItem;
// 		// Profit percent is between 5% - 7%
// 		let profitPercent = Math.floor(Math.random() * 3) + 5;
// 		let totalItemsProfit = (profitPercent / 100) * price * count;
// 		totalItemsProfit = Math.round((totalItemsProfit + Number.EPSILON) * 100) / 100;

// 		return { itemId: _id, totalItemsProfit, profitPercent, count, price };
// 	});
// 	const totalPrice = cartData.reduce((total, item) => total + item.price * item.count, 0);
// 	const totalProfit = cartData.reduce((total, item) => total + item.totalItemsProfit, 0);
// 	let avgProfitPercent = (totalProfit / totalPrice) * 100;

// 	console.log(user.balance);

// 	if (user.balance < totalPrice) {
// 		res.status(400);
// 		throw new Error("Balance is insufficient to complete purchase");
// 	}

// 	let response = { cart: cartData, endDate, totalPrice, totalProfit, avgProfitPercent: Math.round((avgProfitPercent + Number.EPSILON) * 100) / 100, status: "pending", user: req.session.user._id };

// 	await User.updateOne({ _id: req.session.user._id }, { $inc: { balance: -totalPrice } });
// 	await Order.create(response);

// 	// TODO : Insert transaction
// 	await Cart.deleteOne({ user: req.session.user._id });

// 	res.status(200).json({ success: true });
// });
ordersRouter.get("/", user, getOrders);
// ordersRouter.get("/checkout", user, checkoutCart);
// ordersRouter.post("/", user, insertUserCart);

module.exports = ordersRouter;
