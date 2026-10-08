const mongoose = require("mongoose");

const newsletterSchema = mongoose.Schema(
	{
		email: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
			unique: true,
		},
		status: {
			type: String,
			enum: ["active", "inactive"],
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
