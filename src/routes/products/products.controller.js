const asyncHandler = require("express-async-handler");
const Products = require("../../schemas/Products.schema");
const createSlugName = require("../../utils/createSlugName");

const getProducts = asyncHandler(async (req, res) => {
	res.json({ data: "okay" });
});
const getAProduct = asyncHandler(async (req, res) => {
	res.json({ data: "okay" });
});
const deleteAProduct = asyncHandler(async (req, res) => {
	res.json({ data: "okay" });
});

const updateAProduct = asyncHandler(async (req, res) => {
	res.json({ data: "okay" });
});

const createAProduct = asyncHandler(async (req, res) => {
	const { name, price, category, store, long_desc, short_desc } = req.body;
	if (!name || !price || !category || !store || !short_desc) {
		res.status(400);
		throw new Error("Please provide all necessary information");
	}

	const slugname = createSlugName(name);
	console.log(slugname);

	const product = await Products.findOne({ slugname });

	if (product) {
		res.status(400);
		throw new Error("A product with this particular name exists. Please change the name");
	}

	const response = await Products.create({ name, price, category, store, long_desc, short_desc, slugname });
	res.status(200).json({ slugname: response?.slugname });
});
module.exports = { getProducts, getAProduct, deleteAProduct, updateAProduct, createAProduct };
