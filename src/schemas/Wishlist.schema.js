const mongoose = require("mongoose");

const wishListSchema = mongoose.Schema({
	wishlist: { type: [mongoose.Schema.Types.ObjectId], ref: "Product" },
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		unique: true, // One wishlist per user
	},
});

module.exports = mongoose.model("WishList", wishListSchema);
