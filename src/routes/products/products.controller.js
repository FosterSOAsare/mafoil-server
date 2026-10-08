const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Products = require("../../schemas/Products.schema");
const Cart = require("../../schemas/Cart.schema");
const WishList = require("../../schemas/Wishlist.schema");
const { deleteFile } = require("../../libs/cloudinary");
const createSlugName = require("../../utils/createSlugName");
const { isNonEmptyString, escapeRegex, parseIntInRange } = require("../../utils/validate");

const CATEGORIES = ["cloth", "shoe", "bag", "accessories"];
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 100;
const MAX_IMAGES = 10;

const isSlug = (value) => typeof value === "string" && value.length > 0 && value.length <= 100;

// Validates the product fields sent by the admin create/edit forms. Returns an error message, or null.
function validateProductInput({ name, price, category, store, long_desc, short_desc, images }) {
	if (!isNonEmptyString(name, 120) || name.trim().length < 3) return "Please provide a product name (3 to 120 characters)";
	if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return "Please provide a price greater than 0";
	if (!CATEGORIES.includes(category)) return "Please choose a valid category";
	if (!isNonEmptyString(store, 100)) return "Please choose a store";
	if (!isNonEmptyString(short_desc, 1000)) return "Please provide a short description (up to 1000 characters)";
	if (long_desc !== undefined && long_desc !== "" && !isNonEmptyString(long_desc, 10000)) return "The long description must be at most 10000 characters";
	const validImages =
		Array.isArray(images) &&
		images.length > 0 &&
		images.length <= MAX_IMAGES &&
		images.every((image) => image && typeof image.url === "string" && image.url.startsWith("https://res.cloudinary.com/") && isNonEmptyString(image.public_id, 300));
	if (!validImages) return `Please upload between 1 and ${MAX_IMAGES} product images`;
	return null;
}

const pickProductFields = ({ name, price, category, store, long_desc, short_desc, images }) => ({
	name: name.trim(),
	price: Math.round(price * 100) / 100,
	category,
	store: store.trim(),
	long_desc: typeof long_desc === "string" ? long_desc.trim() : "",
	short_desc: short_desc.trim(),
	images: images.map(({ url, public_id }) => ({ url, public_id })),
});

const getProducts = asyncHandler(async (req, res) => {
	const { category } = req.query;
	const page = parseIntInRange(req.query.page, { fallback: 1, min: 1, max: 100000 });
	// "all" used to mean no limit; it is now capped like any other size
	const size = req.query.size === "all" ? MAX_PAGE_SIZE : parseIntInRange(req.query.size, { fallback: DEFAULT_PAGE_SIZE, min: 1, max: MAX_PAGE_SIZE });
	const filter = CATEGORIES.includes(category) ? { category } : {};

	const totalCount = await Products.countDocuments(filter);
	const response = await Products.find(filter)
		.sort({ _id: 1 })
		.skip((page - 1) * size)
		.limit(size);

	res.status(200).json({ data: response, nextPage: totalCount > page * size });
});

const getProductRecommendations = asyncHandler(async (req, res) => {
	const { slugname } = req.params;
	const product = isSlug(slugname) ? await Products.findOne({ slugname }, { category: 1, slugname: 1 }) : null;
	if (!product) {
		res.status(404);
		throw new Error("Product does not exist");
	}
	const recommendations = await Products.find({ category: product.category, _id: { $ne: product._id } }).limit(4);
	res.status(200).json(recommendations);
});

const getRecentProducts = asyncHandler(async (req, res) => {
	const { recents } = req.body;
	if (!Array.isArray(recents) || recents.length > 20 || !recents.every(isSlug)) {
		res.status(400);
		throw new Error("Please provide a list of up to 20 product slugs");
	}
	const products = await Products.find({ slugname: { $in: recents } });
	res.status(200).json(products);
});

const getAProduct = asyncHandler(async (req, res) => {
	const { slugname } = req.params;
	const product = isSlug(slugname) ? await Products.findOne({ slugname }, { __v: 0 }) : null;
	if (!product) {
		res.status(404);
		throw new Error("Product was not found");
	}
	res.status(200).json(product);
});

const deleteAProduct = asyncHandler(async (req, res) => {
	// Accepts the product id (what the admin client sends) or its slug
	const { id } = req.params;
	const filter = mongoose.isValidObjectId(id) ? { _id: id } : isSlug(id) ? { slugname: id } : null;
	const product = filter ? await Products.findOneAndDelete(filter) : null;
	if (!product) {
		res.status(404);
		throw new Error("The requested product does not exist");
	}

	// Remove it from carts and wishlists. Orders keep their own copy of the price and show it as unavailable.
	await Cart.updateMany({}, { $pull: { cart: { itemId: product._id } } });
	await WishList.updateMany({}, { $pull: { wishlist: product._id } });
	// Best effort: a failed image delete shouldn't undo the product delete
	await Promise.allSettled((product.images || []).filter((image) => image.public_id?.startsWith("mafoil/")).map((image) => deleteFile(image.public_id)));

	res.status(200).json({ success: true, message: "Product was successfully deleted" });
});

const getProductForEdit = asyncHandler(async (req, res) => {
	const { slugname } = req.params;
	const product = isSlug(slugname) ? await Products.findOne({ slugname }, { __v: 0, createdAt: 0, updatedAt: 0 }) : null;
	if (!product) {
		res.status(404);
		throw new Error("Product was not found");
	}
	res.status(200).json(product);
});

const updateAProduct = asyncHandler(async (req, res) => {
	const { slugname } = req.params;
	const error = validateProductInput(req.body);
	if (error) {
		res.status(400);
		throw new Error(error);
	}
	const product = isSlug(slugname) ? await Products.findOne({ slugname }) : null;
	if (!product) {
		res.status(404);
		throw new Error("The requested product does not exist");
	}

	const fields = pickProductFields(req.body);
	let newSlugname = product.slugname;
	if (fields.name.toLowerCase() !== product.name?.toLowerCase()) {
		newSlugname = createSlugName(fields.name);
		const existing = await Products.findOne({ slugname: newSlugname, _id: { $ne: product._id } }, { _id: 1 });
		if (existing) {
			res.status(400);
			throw new Error("A product with this particular name exists. Please change the name");
		}
	}

	await Products.updateOne({ _id: product._id }, { $set: { ...fields, slugname: newSlugname } }, { runValidators: true });
	res.status(200).json({ slugname: newSlugname });
});

const createAProduct = asyncHandler(async (req, res) => {
	const error = validateProductInput(req.body);
	if (error) {
		res.status(400);
		throw new Error(error);
	}
	const fields = pickProductFields(req.body);
	const slugname = createSlugName(fields.name);

	if (await Products.exists({ slugname })) {
		res.status(400);
		throw new Error("A product with this particular name exists. Please change the name");
	}

	// The unique index on slugname also rejects a concurrent duplicate (409 from the error middleware)
	const response = await Products.create({ ...fields, slugname });
	res.status(200).json({ slugname: response.slugname });
});

const fetchCategoriesInfo = asyncHandler(async (req, res) => {
	const counts = await Products.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]);
	const result = { cloth: 0, shoe: 0, bag: 0, accessories: 0, all: 0 };
	for (const { _id, count } of counts) {
		if (_id in result) result[_id] = count;
		result.all += count;
	}
	res.status(200).json(result);
});

const searchProducts = asyncHandler(async (req, res) => {
	const { searchText } = req.query;
	if (searchText !== undefined && typeof searchText !== "string") {
		res.status(400);
		throw new Error("Please provide valid search text");
	}
	const text = (searchText || "").trim().slice(0, 100);
	// The input is escaped so it is matched literally (no regex injection or catastrophic backtracking)
	const products = text ? await Products.find({ name: { $regex: escapeRegex(text), $options: "i" } }).limit(48) : await Products.aggregate([{ $sample: { size: 12 } }]);
	res.status(200).json(products);
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
	searchProducts,
};
