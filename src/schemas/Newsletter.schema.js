const mongoose = require("mongoose");

const newsletterSchema = mongoose.Schema(
	{
		email: {
			type: String,
			required: true,
		},
		status: {
			type: String,
			default: "active",
		},
		code: {
			type: String,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("Newsletter", newsletterSchema);
