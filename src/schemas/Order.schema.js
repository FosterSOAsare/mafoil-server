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

const orderSchema = mongoose.Schema({
	cart: [subSchema],
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
	},
	endDate: Date,
	avgProfitPercent: Number,
	totalPrice: Number,
	totalProfit: Number,
	status: String,
});

module.exports = mongoose.model("Order", orderSchema);
