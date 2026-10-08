const mongoose = require("mongoose");

const subSchema = mongoose.Schema(
	{
		itemId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Product",
		},
		count: Number,
		totalItemsProfit: Number,
		profitPercent: Number,
		count: Number,
		price: Number,
	},
	{ _id: false }
);

const orderSchema = mongoose.Schema(
	{
		cart: [subSchema],
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		endDate: Date,
		avgProfitPercent: Number,
		totalPrice: Number,
		totalProfit: Number,
		status: { type: String, enum: ["pending", "completed", "cancelled"], required: true },
		completionDate: {
			type: Date,
		},
	},
	{ timestamps: true }
);

// Used by the finalise-order cron and by the user's order list
orderSchema.index({ status: 1, endDate: 1 });
orderSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
