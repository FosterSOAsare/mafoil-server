const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Products = require("../../schemas/Products.schema");
const Reviews = require("../../schemas/Reviews.schema");
const Notifications = require("../../schemas/Notification.schema");
const HttpError = require("../../utils/http-error");
const { isNonEmptyString, getPagination } = require("../../utils/validate");

const isSlug = (value) => typeof value === "string" && value.length > 0 && value.length <= 100;

const getProductReviews = asyncHandler(async (req, res) => {
	const product = isSlug(req.params.slugname) ? await Products.findOne({ slugname: req.params.slugname }, { _id: 1 }) : null;
	if (!product) {
		res.status(404);
		throw new Error("Product does not exist");
	}

	const { limit, skip } = getPagination(req.query);
	// Public listing: never expose the reviewer's email or account id
	const reviews = await Reviews.find({ product: product._id, status: "accepted" }, { email: 0, user: 0, __v: 0 }).sort({ createdAt: -1 }).skip(skip).limit(limit);
	res.status(200).json(reviews);
});

const getPendingProductReviews = asyncHandler(async (req, res) => {
	const { limit, skip } = getPagination(req.query);
	const reviews = await Reviews.find({ status: "pending" }).sort({ createdAt: -1 }).skip(skip).limit(limit);
	res.status(200).json(reviews);
});

const moderateProductReview = asyncHandler(async (req, res) => {
	const { status } = req.body;
	const { reviewId } = req.params;
	if (status !== "accepted" && status !== "rejected") {
		res.status(400);
		throw new Error("The provided moderation is not expected");
	}
	if (!mongoose.isValidObjectId(reviewId)) {
		res.status(404);
		throw new Error("Review does not exist");
	}

	await mongoose.connection.transaction(async (session) => {
		// Only pending reviews can be moderated, so a review is counted at most once and never re-moderated
		const review = await Reviews.findOneAndUpdate({ _id: reviewId, status: "pending" }, { $set: { status } }, { session, new: true });
		if (!review) {
			const exists = await Reviews.exists({ _id: reviewId }).session(session);
			throw new HttpError(exists ? 409 : 404, exists ? "This review has already been moderated" : "Review does not exist");
		}

		const product = await Products.findOne({ _id: review.product }, { name: 1, slugname: 1 }, { session });
		if (status === "accepted" && product) {
			// Increment the totals and recompute the average in one atomic update
			await Products.updateOne(
				{ _id: product._id },
				[
					{
						$set: {
							"rating.accumulatedRating": { $add: [{ $ifNull: ["$rating.accumulatedRating", 0] }, review.rating] },
							"rating.totalRatings": { $add: [{ $ifNull: ["$rating.totalRatings", 0] }, 1] },
						},
					},
					{ $set: { "rating.avgRating": { $round: [{ $divide: ["$rating.accumulatedRating", "$rating.totalRatings"] }, 1] } } },
				],
				{ session }
			);
		}

		// Tell the user their review was moderated
		const productName = product?.name || "a product";
		await Notifications.create(
			[
				{
					link: product ? `/products/${product.slugname}` : "/products",
					user: review.user,
					desc: `Your review on ${productName} has been ${status}. ${status === "rejected" ? `If you need an explanation, open a complaint with ${review.product} as a ticket id` : ""}`.trim(),
				},
			],
			{ session }
		);
	});

	res.status(200).json({ success: true });
});

const postAProductReview = asyncHandler(async (req, res) => {
	const { fullname, email, _id } = req.user;
	let { title, rating, comment } = req.body;
	if (!isNonEmptyString(title, 200) || !isNonEmptyString(comment, 5000)) {
		res.status(400);
		throw new Error("Please provide a title (up to 200 characters) and a comment (up to 5000 characters)");
	}
	if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
		res.status(400);
		throw new Error("The rating must be a whole number from 1 to 5");
	}
	const product = isSlug(req.params.slugname) ? await Products.findOne({ slugname: req.params.slugname }, { name: 1, slugname: 1 }) : null;
	if (!product) {
		res.status(404);
		throw new Error("Product does not exist");
	}
	if (await Reviews.exists({ user: _id, product: product._id })) {
		res.status(409);
		throw new Error("You have already reviewed this product");
	}

	let notif;
	await mongoose.connection.transaction(async (session) => {
		// The unique { user, product } index also rejects a concurrent duplicate
		await Reviews.create([{ title: title.trim(), rating, user: _id, email, comment: comment.trim(), name: fullname, product: product._id, status: "pending" }], { session });

		// Tell the user their review has been received
		notif = await Notifications.create(
			[{ link: `/products/${product.slugname}`, user: _id, desc: `Your review on ${product.name} has been received and is waiting for moderation.` }],
			{ session }
		);
	});

	res.status(200).json({ success: true, notif });
});

module.exports = {
	getProductReviews,
	postAProductReview,
	getPendingProductReviews,
	moderateProductReview,
};
