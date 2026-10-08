require("dotenv").config();
const express = require("express");
const multer = require("multer");
const asyncHandler = require("express-async-handler");

const { getSecuredUrl, deleteFile } = require("../libs/cloudinary");
const { upload, MAX_FILE_SIZE } = require("../libs/multer");
const user = require("../middlewares/user.middleware");
const admin = require("../middlewares/admin.middleware");

const filesRouter = express.Router();

// Product images are stored in this Cloudinary folder; nothing outside it may be deleted
const UPLOAD_FOLDER = "mafoil";

// Runs multer and turns its errors (size, type, extra files) into 400 responses
const uploadSingleImage = (req, res, next) => {
	upload.single("file")(req, res, (err) => {
		if (err instanceof multer.MulterError) {
			res.status(400);
			const message = err.code === "LIMIT_FILE_SIZE" ? `Images must be ${MAX_FILE_SIZE / (1024 * 1024)} MB or smaller` : "Please upload a single image in the \"file\" field";
			return next(new Error(message));
		}
		next(err);
	});
};

const uploadFile = asyncHandler(async (req, res) => {
	if (!req.file) {
		res.status(400);
		throw new Error("Please attach an image to upload");
	}
	let { url, public_id } = await getSecuredUrl(req.file, UPLOAD_FOLDER);
	res.status(200).json({ url, public_id });
});

const controllerDeleteFile = asyncHandler(async (req, res) => {
	const { public_id } = req.query;
	if (typeof public_id !== "string" || !public_id) {
		res.status(400);
		throw new Error("Please enter a public_id of the file you want to delete");
	}
	if (!public_id.startsWith(`${UPLOAD_FOLDER}/`) || public_id.includes("..")) {
		res.status(403);
		throw new Error("This file cannot be deleted");
	}
	await deleteFile(public_id);
	res.status(200).json({ success: true });
});

filesRouter.post("/", user, admin, uploadSingleImage, uploadFile);
filesRouter.delete("/", user, admin, controllerDeleteFile);

module.exports = filesRouter;
