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
		session: {
			// Stripe checkout session id. Unique so the same deposit can never be credited twice
			type: String,
			index: { unique: true, sparse: true },
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("Transaction", transactionSchema);
