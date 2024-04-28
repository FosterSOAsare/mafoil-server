const express = require("express");
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");

const user = require("../middlewares/user.middleware");
const contactRouter = express.Router();

const getAllContacts = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true });
});

const insertContactMsg = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true });
});
contactRouter.post("/", insertContactMsg);
contactRouter.get("/", user, getAllContacts);

module.exports = contactRouter;
