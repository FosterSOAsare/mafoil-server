const mongoose = require("mongoose");

const reviewsSchema = mongoose.Schema(
	{
		name: {
			required: true,
			type: String,
		},
		email: {
			required: true,
			type: String,
		},
		rating: {
			required: true,
			type: Number,
		},
		title: {
			required: true,
			type: String,
		},
		comment: {
			required: true,
			type: String,
		},
		status: {
			type: String,
			default: "pending",
		},
		user: {
			required: true,
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		product: {
			required: true,
			type: mongoose.Schema.Types.ObjectId,
			ref: "Product",
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("Review", reviewsSchema);
