const mongoose = require("mongoose");

const subSchema = mongoose.Schema(
	{
		itemId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Product",
		},
		count: Number,
	},
	{ _id: false }
);

const cartSchema = mongoose.Schema({
	cart: [subSchema],
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
	},
});

module.exports = mongoose.model("Cart", cartSchema);
