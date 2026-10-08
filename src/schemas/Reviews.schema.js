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
			min: 1,
			max: 5,
			validate: { validator: Number.isInteger, message: "Rating must be a whole number" },
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
			enum: ["pending", "accepted", "rejected"],
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

// One review per user per product, and fast lookups of a product's accepted reviews
reviewsSchema.index({ user: 1, product: 1 }, { unique: true });
reviewsSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewsSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewsSchema);
