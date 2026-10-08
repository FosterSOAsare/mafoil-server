const express = require("express");
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");

const user = require("../middlewares/user.middleware");
const WishList = require("../schemas/Wishlist.schema");
const Product = require("../schemas/Products.schema");

const wishlistRouter = express.Router();

const MAX_WISHLIST_ITEMS = 100;

const getUserWishList = asyncHandler(async (req, res) => {
	const wishlist = await WishList.findOne({ user: req.user._id });
	if (!wishlist) {
		res.status(200).json([]);
		return;
	}

	// One query for all products; deleted products are dropped, and the real ratings are returned
	const products = await Product.find({ _id: { $in: wishlist.wishlist } }, { __v: 0 });
	const productsById = new Map(products.map((product) => [product._id.toString(), product]));
	const populatedWishList = wishlist.wishlist.map((id) => productsById.get(id.toString())).filter(Boolean);
	res.status(200).json(populatedWishList);
});

const insertUserWishlist = asyncHandler(async (req, res) => {
	const { wishlist: wishlistData } = req.body;
	if (!Array.isArray(wishlistData) || wishlistData.length > MAX_WISHLIST_ITEMS || !wishlistData.every((item) => typeof item === "string" && mongoose.isValidObjectId(item))) {
		res.status(400);
		throw new Error(`Please include a valid wishlist (up to ${MAX_WISHLIST_ITEMS} product ids)`);
	}

	const uniqueIds = [...new Set(wishlistData)];
	await WishList.updateOne({ user: req.user._id }, { $set: { wishlist: uniqueIds } }, { upsert: true });
	res.status(200).json({ success: true });
});

wishlistRouter.get("/", user, getUserWishList);
wishlistRouter.post("/", user, insertUserWishlist);

module.exports = wishlistRouter;
