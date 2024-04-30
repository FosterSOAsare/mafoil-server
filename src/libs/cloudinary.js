require("dotenv").config();
const cloudinary = require("cloudinary");
const path = require("path");
const DataUri = require("datauri/parser");

const parser = new DataUri();

cloudinary.v2.config({
	cloud_name: process.env.cloudinary_cloud_name,
	api_key: process.env.cloudinary_api_key,
	api_secret: process.env.cloudinary_api_secret,
	secure: true,
});

async function getSecuredUrl(file) {
	const extName = path.extname(file.originalname).toString();
	let format = extName.replace(".", "");
	const file64 = parser.format(extName, file.buffer);

	let res = {};

	res = await cloudinary.v2.uploader.upload(file64.content, { folder: "mafoil", format, use_filename: true });

	return { public_id: res.public_id, url: res.secure_url };
}

async function deleteFile(public_id) {
	await cloudinary.v2.uploader.destroy(public_id);
	return true;
}
const randImageName = (fileType, bytes = 32) => {
	let ext = fileType.split("/")[1];
	return crypto.randomBytes(bytes).toString("hex") + "." + ext;
};

module.exports = { getSecuredUrl, deleteFile, randImageName };
