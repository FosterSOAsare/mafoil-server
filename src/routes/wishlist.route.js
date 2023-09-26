const express = require("express");
const asyncHandler = require("express-async-handler");

const user = require("../middlewares/user.middleware");
const Cart = require("../schemas/Cart.schema");
const WishList = require("../schemas/Wishlist.schema");
const Product = require("../schemas/Products.schema");

const wishlistRouter = express.Router();

const getUserWishList = asyncHandler(async (req, res) => {
	const userId = req.session.user._id;
	let wishlist = await WishList.findOne({ user: userId });

	if (!wishlist) {
		res.status(200).json([]);
		return;
	}
	let populatedWishList = await Promise.all(
		wishlist.wishlist.map((item) => {
			return Product.findOne({ _id: item }, { __v: 0 });
		})
	);
	// Add ratings

	populatedWishList = populatedWishList.map((item, index) => ({ ...item?._doc, rating: 0, totalRatings: 0 }));
	res.status(200).json(populatedWishList);
});
const insertUserWishlist = asyncHandler(async (req, res) => {
	let { wishlist: wishlistData } = req.body;
	const userId = req.session.user._id;
	if (!wishlistData || !Array.isArray(wishlistData)) {
		throw new Error("Please include a wishlist to the request");
	}
	const valid = wishlistData.every((item) => {
		return typeof item === "string";
	});
	if (!valid) {
		throw new Error("Please include a valid wishlist to the request");
	}
	const wishlist = await WishList.findOne({ user: userId });

	if (wishlist) {
		// Update wishlist
		await WishList.updateOne({ _id: wishlist?._id }, { $set: { wishlist: wishlistData } });
	} else {
		await WishList.create({ wishlist: wishlistData, user: req.session.user?._id });
	}
	res.status(200).json({ success: true });
});
wishlistRouter.get("/", user, getUserWishList);
wishlistRouter.post("/", user, insertUserWishlist);

module.exports = wishlistRouter;
