const mongoose = require("mongoose");

const wishListSchema = mongoose.Schema({
	wishlist: { type: [mongoose.Schema.Types.ObjectId], ref: "Product" },
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
	},
});

module.exports = mongoose.model("WishList", wishListSchema);
