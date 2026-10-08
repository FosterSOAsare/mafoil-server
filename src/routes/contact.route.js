const express = require("express");
const asyncHandler = require("express-async-handler");
const { rateLimit } = require("express-rate-limit");

const user = require("../middlewares/user.middleware");
const { sendContactEmail } = require("../libs/nodemailer");
const contactRouter = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The form needs no login, so limit how often one client can send messages to the support inbox
const contactLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	limit: 5,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	message: { error: "Too many messages sent. Please try again later." },
});

const getAllContacts = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true });
});

const insertContactMsg = asyncHandler(async (req, res) => {
	// Send email alone
	const { title, email, message, ticket } = req.body;
	const isText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

	if (!isText(title, 200) || !isText(message, 5000) || typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()) || email.length > 254) {
		res.status(400);
		throw new Error("Please provide a title, a valid email address and a message");
	}
	if (ticket !== undefined && ticket !== "" && !isText(ticket, 100)) {
		res.status(400);
		throw new Error("Please provide a valid ticket ID");
	}

	await sendContactEmail({ title: title.trim(), ticket: ticket?.trim(), message: message.trim(), email: email.trim() });
	res.status(200).json({ success: true });
});
contactRouter.post("/", contactLimiter, insertContactMsg);
contactRouter.get("/", user, getAllContacts);

module.exports = contactRouter;
