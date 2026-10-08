const mongoose = require("mongoose");

const subSchema = mongoose.Schema(
	{
		itemId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Product",
		},
		count: { type: Number, required: true, min: 1, max: 99, validate: { validator: Number.isInteger, message: "Count must be a whole number" } },
	},
	{ _id: false }
);

const cartSchema = mongoose.Schema({
	cart: [subSchema],
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		unique: true, // One cart per user
	},
});

module.exports = mongoose.model("Cart", cartSchema);
