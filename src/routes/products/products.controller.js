const asyncHandler = require("express-async-handler");
const Products = require("../../schemas/Products.schema");
const createSlugName = require("../../utils/createSlugName");
s;

const getProducts = asyncHandler(async (req, res) => {
	let { category, page } = req.query;
	page = page ? page : 1;
	let obj = category && category !== "all" ? { category } : {};
	let totalCount = await Products.countDocuments(obj);
	let response = await Products.find(obj)
		.sort({ _id: 1 })
		.limit(12)
		.skip((page - 1) * 12);

	res.status(200).json({ data: response, nextPage: totalCount > response.length + (page - 1) * 12 });
});

const getProductRecommendations = asyncHandler(async (req, res) => {
	let product = await Products.findOne({ slugname: req.params?.slugname }, { __v: 0 });
	if (!product) {
		res.status(400);
		throw new Error("Product does not exist");
	}
	let recommendations = await Products.find({ category: product?.category, slugname: { $not: { $eq: product?.slugname } } }).limit(4);
	res.status(200).json(recommendations);
});

const getRecentProducts = asyncHandler(async (req, res) => {
	let { recents } = req.body;
	recents = await Products.find({ slugname: { $in: recents } });

	res.status(200).json(recents);
});
const getAProduct = asyncHandler(async (req, res) => {
	const { slugname } = req.params;

	let product = await Products.findOne({ slugname }, { __v: 0 });

	if (!product) {
		res.status(404);
		throw new Error("Product was not found");
	}

	res.status(200).json(product);
});
const deleteAProduct = asyncHandler(async (req, res) => {
	let { slugname } = req.query;
	res.json({ data: "okay" });
});

const getProductForEdit = asyncHandler(async (req, res) => {
	const { slugname } = req.params;

	let product = await Products.findOne({ slugname }, { __v: 0, createdAt: 0, updatedAt: 0 });

	if (!product) {
		res.status(404);
		throw new Error("Product was not found");
	}

	res.status(200).json(product);
});

const updateAProduct = asyncHandler(async (req, res) => {
	const { name, price, category, store, long_desc, short_desc, images } = req.body;
	let { slugname } = req.params;
	if (!name || !price || !category || !store || !short_desc || images?.length === 0 || !slugname) {
		res.status(400);
		throw new Error("Please provide all necessary information");
	}

	const product = await Products.findOne({ slugname });
	if (!product) {
		res.status(404);
		throw new Error("The requested product does not exist");
	}
	let newSlugname = slugname;

	if (name.toLowerCase() !== product?.name?.toLowerCase()) {
		// Check slugname
		newSlugname = createSlugName(name);
		const product = await Products.findOne({ slugname: newSlugname });
		if (product) {
			res.status(400);
			throw new Error("A product with this particular name exists. Please change the name");
		}
	}

	await Products.updateOne({ _id: product?._id }, { $set: { name, price, category, store, long_desc, short_desc, slugname: newSlugname, images } });
	res.status(200).json({ slugname: newSlugname });
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

const fetchCategoriesInfo = asyncHandler(async (req, res) => {
	let all = await Products.countDocuments();
	let cloth = await Products.countDocuments({ category: "cloth" });
	let shoe = await Products.countDocuments({ category: "shoe" });
	let bag = await Products.countDocuments({ category: "bag" });
	let accessories = await Products.countDocuments({ category: "accessories" });

	res.status(200).json({ cloth, shoe, bag, accessories, all });
});
module.exports = {
	getProducts,
	getAProduct,
	deleteAProduct,
	updateAProduct,
	createAProduct,
	getProductForEdit,
	fetchCategoriesInfo,
	getProductRecommendations,
	getRecentProducts,
};
