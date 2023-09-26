const express = require("express");
const user = require("../middlewares/user.middleware");
const asyncHandler = require("express-async-handler");
const Newsletter = require("../schemas/Newsletter.schema");

const newsletterRouter = express.Router();

const controllerGetNewsletters = asyncHandler(async (req, res) => {
	const newsletter = await Newsletter.find({}, { __v: 0, updatedAt: 0, createdAt: 0 }).sort({ createdAt: -1 });
	res.status(200).json(newsletter);
});

const controllerModerateNewsletterSubscription = asyncHandler(async (req, res) => {
	const { email, moderation } = req.body;

	if (!email) {
		res.status(400);
		throw new Error("Please provide an email address");
	}
	const newsletter = await Newsletter.findOne({ email });

	if (!newsletter) {
		await Newsletter.create({ email, status: "active" });
	} else {
		await Newsletter.updateOne({ email }, { $set: { status: moderation === "unsub" ? "inactive" : "active" } });
	}

	res.status(200).json({ success: true });
});
newsletterRouter.get("/all", user, controllerGetNewsletters);
newsletterRouter.post("/", user, controllerModerateNewsletterSubscription);

module.exports = newsletterRouter;
