const express = require("express");
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");

const user = require("../middlewares/user.middleware");
const { sendContactEmail } = require("../libs/nodemailer");
const contactRouter = express.Router();

const getAllContacts = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true });
});

const insertContactMsg = asyncHandler(async (req, res) => {
	// Send email alone
	const { title, email, message, ticket } = req.body;
	if (!title || !email || !message) {
		res.status(400);
		throw new Error("Please provide all required fields");
	}
	await sendContactEmail({ title, ticket, message, email });
	res.status(200).json({ success: true });
});
contactRouter.post("/", insertContactMsg);
contactRouter.get("/", user, getAllContacts);

module.exports = contactRouter;
