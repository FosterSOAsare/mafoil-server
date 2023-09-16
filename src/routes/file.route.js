require("dotenv").config();
const express = require("express");
const asyncHandler = require("express-async-handler");

const { getSecuredUrl, deleteFile, randImageName } = require("../libs/cloudinary");
const { upload } = require("../libs/multer");
const user = require("../middlewares/user.middleware");

const filesRouter = express.Router();

const uploadFile = asyncHandler(async (req, res) => {
	// const filename = randImageName(req.file.mimetype);
	let { url, public_id } = await getSecuredUrl(req.file);
	res.status(200).json({ url, public_id });
});

const controllerDeleteFile = asyncHandler(async (req, res) => {
	const { public_id } = req.query;
	await deleteFile(public_id);
	res.status(200).json({ success: true });
});

filesRouter.post("/", upload.single("file"), uploadFile);
filesRouter.delete("/:public_id", user, controllerDeleteFile);

module.exports = filesRouter;
