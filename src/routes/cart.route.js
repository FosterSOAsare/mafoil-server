const express = require("express");
const asyncHandler = require("express-async-handler");

const user = require("../middlewares/user.middleware");
const Cart = require("../schemas/Cart.schema");
const Product = require("../schemas/Products.schema");

const cartRouter = express.Router();

const getUserCart = asyncHandler(async (req, res) => {
	const userId = req.session.user._id;
	let cart = await Cart.findOne({ user: userId });

	cart = cart?.cart ? cart?.cart : [];
	let populatedCart = await Promise.all(
		cart.map((item) => {
			return Product.findOne({ _id: item.itemId });
		})
	);

	// Add the count property
	populatedCart = populatedCart.map((item, index) => ({ ...item?._doc, count: cart[index]?.count }));
	res.status(200).json(populatedCart);
});
const insertUserCart = asyncHandler(async (req, res) => {
	let { cart: cartData } = req.body;
	const userId = req.session.user._id;
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
cartRouter.get("/", user, getUserCart);
cartRouter.post("/", user, insertUserCart);

module.exports = cartRouter;
