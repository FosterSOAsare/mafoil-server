const mongoose = require("mongoose");

const transactionSchema = mongoose.Schema(
	{
		type: {
			type: String,
			enum: ["deposit", "withdraw"],
			required: true,
		},
		status: {
			type: String,
			enum: ["pending", "completed", "cancelled"],
			default: "pending",
		},
		amount: {
			type: Number,
			required: true,
			min: 0,
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

// The user's transaction history and the admin list
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
