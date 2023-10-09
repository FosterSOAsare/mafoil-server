const express = require("express");
const { getProductReviews, postAProductReview, getPendingProductReviews, moderateProductReview } = require("./reviews.controller");

const reviewsRouter = express.Router();
const user = require("../../middlewares/user.middleware");
const admin = require("../../middlewares/admin.middleware");

reviewsRouter.get("/pending", user, admin, getPendingProductReviews);
reviewsRouter.get("/:slugname", getProductReviews);
reviewsRouter.put("/:reviewId", user, admin, moderateProductReview);
reviewsRouter.post("/:slugname", user, postAProductReview);

module.exports = reviewsRouter;
