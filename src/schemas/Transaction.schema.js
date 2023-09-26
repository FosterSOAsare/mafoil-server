const mongoose = require("mongoose");

const transactionSchema = mongoose.Schema(
	{
		type: {
			// Deposit || withdraw
			type: String,
			required: true,
		},
		status: {
			type: String,
			default: "pending",
		},
		amount: {
			type: Number,
			required: true,
		},
		desc: {
			type: String,
			required: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			required: true,
		},
		address: {
			type: String,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("Transaction", transactionSchema);
