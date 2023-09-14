const mongoose = require("mongoose");

const productsSchema = mongoose.Schema(
	{
		name: {
			required: true,
			type: String,
		},
		price: {
			required: true,
			type: Number,
		},
		old_price: {
			required: false,
			type: Number,
		},
		short_desc: {
			required: true,
			type: String,
		},
		slugname: {
			required: true,
			type: String,
		},
		long_desc: {
			type: String,
		},
		category: {
			type: String,
		},
		store: {
			type: String,
		},
		images: {
			type: [{ public_id: String, url: String }],
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model("Product", productsSchema);
