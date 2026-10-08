require("dotenv").config();
const cloudinary = require("cloudinary");
const DataUri = require("datauri/parser");

const parser = new DataUri();

cloudinary.v2.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.cloudinary_cloud_name,
	api_key: process.env.CLOUDINARY_API_KEY || process.env.cloudinary_api_key,
	api_secret: process.env.CLOUDINARY_API_SECRET || process.env.cloudinary_api_secret,
	secure: true,
});

async function getSecuredUrl(file, folder = "mafoil") {
	// Derive the format from the validated mime type, not the client-supplied file name
	const format = file.mimetype.split("/")[1].replace("jpeg", "jpg");
	const file64 = parser.format(`.${format}`, file.buffer);

	let res = {};

	res = await cloudinary.v2.uploader.upload(file64.content, { folder, format, use_filename: true });

	return { public_id: res.public_id, url: res.secure_url };
}

async function deleteFile(public_id) {
	await cloudinary.v2.uploader.destroy(public_id);
	return true;
}
module.exports = { getSecuredUrl, deleteFile };
