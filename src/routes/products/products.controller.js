const asyncHandler = require("express-async-handler");
const Products = require("../../schemas/Products.schema");
const createSlugName = require("../../utils/createSlugName");

const getProducts = asyncHandler(async (req, res) => {
	let { category, page } = req.query;
	page = page ? page : 1;
	let obj = category && category !== "all" ? { category } : {};
	let totalCount = await Products.countDocuments(obj);
	let response = await Products.find(obj)
		.sort({ _id: 1 })
		.limit(12)
		.skip((page - 1) * 12);
	response = response.map((r) => {
		return { ...r._doc, rating: 0, totalRatings: 0 };
	});

	res.status(200).json({ data: response, nextPage: totalCount > response.length + (page - 1) * 12 });
});
const getAProduct = asyncHandler(async (req, res) => {
	const { slugname } = req.params;

	let product = await Products.findOne({ slugname }, { __v: 0 });

	if (!product) {
		res.status(404);
		throw new Error("Product was not found");
	}
	product = product?._doc;

	let recommendations = await Products.find({ category: product?.category }).limit(4);

	res.status(200).json({ product: { ...product, rating: 0, totalRatings: 0 }, recommendations });
});
const deleteAProduct = asyncHandler(async (req, res) => {
	let { slugname } = req.query;
	res.json({ data: "okay" });
});

const updateAProduct = asyncHandler(async (req, res) => {
	res.json({ data: "okay" });
});

const createAProduct = asyncHandler(async (req, res) => {
	const { name, price, category, store, long_desc, short_desc, images } = req.body;
	if (!name || !price || !category || !store || !short_desc || images?.length === 0) {
		res.status(400);
		throw new Error("Please provide all necessary information");
	}

	const slugname = createSlugName(name);

	const product = await Products.findOne({ slugname });

	if (product) {
		res.status(400);
		throw new Error("A product with this particular name exists. Please change the name");
	}

	const response = await Products.create({ name, price, category, store, long_desc, short_desc, slugname, images });
	res.status(200).json({ slugname: response?.slugname });
});
module.exports = { getProducts, getAProduct, deleteAProduct, updateAProduct, createAProduct };
