const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Products = require("../../schemas/Products.schema");
const Reviews = require("../../schemas/Reviews.schema");
const Notifications = require("../../schemas/Notification.schema");

const getProductReviews = asyncHandler(async (req, res) => {
	let product = await Products.findOne({ slugname: req.params?.slugname }, { __v: 0 });
	if (!product) {
		res.status(404);
		throw new Error("Product does not exist");
	}
	let reviews = await Reviews.find({ product: product?._id, status: "accepted" });
	res.status(200).json(reviews);
});
const getPendingProductReviews = asyncHandler(async (req, res) => {
	let reviews = await Reviews.find({ status: "pending" });
	res.status(200).json(reviews);
});

const moderateProductReview = asyncHandler(async (req, res) => {
	let { status } = req.body;
	if (status !== "accepted" && status !== "rejected") {
		res.status(400);
		throw new Error("The provided moderation is not expected");
	}
	let review = await Reviews.findOne({ _id: req.params?.reviewId }, { __v: 0 });
	if (!review) {
		res.status(404);
		throw new Error("Review does not exist");
	}

	let product = await Products.findOne({ _id: review.product });
	const session = await mongoose.startSession();

	try {
		session.startTransaction();
		const options = { session };

		// Update review based on status
		await Reviews.updateOne({ _id: review?._id }, { $set: { status: status } }, options);

		// Insert notification to tell user that their review was moderated
		await Notifications.create(
			[
				{
					link: `/products/${product?._id}#reviews`,
					user: review.user,
					desc: `Yourreview on ${product?.name} has been ${status}. ${status === "rejected" ? `if you need an explanation, open a complaint with ${product?._id} as a ticket id` : ""}`,
				},
			],
			options
		);

		await session.commitTransaction();
		session.endSession();
	} catch (e) {
		await session.abortTransaction();
		session.endSession();
		res.status(400);
		throw new Error("An error occurred while moderating review");
	}
	res.status(200).json({ success: true });
});

const postAProductReview = asyncHandler(async (req, res) => {
	const { fullname, email, _id } = req.session.user;
	let { title, rating, comment } = req.body;
	if (!title || typeof rating !== "number" || !comment) {
		res.status(400);
		throw new Error("Provide all necessary parameters");
	}
	if (rating > 5) {
		res.status(400);
		throw new Error("The provided rating value in invalid, must be less than or equal to 5");
	}
	let product = await Products.findOne({ slugname: req.params?.slugname }, { __v: 0 });
	if (!product) {
		res.status(404);
		throw new Error("Product does not exist");
	}
	const session = await mongoose.startSession();
	try {
		session.startTransaction();
		const options = { session };

		// Create the review
		await Reviews.create([{ title, rating, user: _id, email, comment, name: fullname, product: product?._id, email, status: "pending" }], options);

		// Insert notification to tell user that their review has been received
		await Notifications.create(
			[{ link: `/products/${product?._id}#reviews`, user: req.session.user?._id, desc: `Your review on ${product?.name} has been received and is waiting for moderation.` }],
			options
		);

		await session.commitTransaction();
		session.endSession();
	} catch (e) {
		await session.abortTransaction();
		session.endSession();
		res.status(400);
		throw new Error("An error occurred while moderating review");
	}

	// Add notification that review has been received
	res.status(200).json({ success: true });
});

module.exports = {
	getProductReviews,
	postAProductReview,
	getPendingProductReviews,
	moderateProductReview,
};
