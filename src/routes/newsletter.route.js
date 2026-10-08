const express = require("express");
const user = require("../middlewares/user.middleware");
const admin = require("../middlewares/admin.middleware");
const asyncHandler = require("express-async-handler");
const Newsletter = require("../schemas/Newsletter.schema");

const newsletterRouter = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const controllerGetNewsletters = asyncHandler(async (req, res) => {
	const newsletter = await Newsletter.find({}, { __v: 0, updatedAt: 0, createdAt: 0 }).sort({ createdAt: -1 });
	res.status(200).json(newsletter);
});

const controllerModerateNewsletterSubscription = asyncHandler(async (req, res) => {
	const { moderation } = req.body;
	const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";

	if (!EMAIL_PATTERN.test(email) || email.length > 254) {
		res.status(400);
		throw new Error("Please provide a valid email address");
	}
	const unsubscribe = moderation === "unsub";
	if (unsubscribe && email !== req.session.user.email.toLowerCase()) {
		res.status(403);
		throw new Error("You can only unsubscribe your own email address");
	}

	await Newsletter.updateOne({ email }, { $set: { status: unsubscribe ? "inactive" : "active" } }, { upsert: true });

	res.status(200).json({ success: true });
});
newsletterRouter.get("/all", user, admin, controllerGetNewsletters);
newsletterRouter.post("/", user, controllerModerateNewsletterSubscription);

module.exports = newsletterRouter;
