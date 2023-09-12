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

async function getSecuredUrl(file, folder, public_id, resource_type = "image") {
	const extName = path.extname(file.originalname).toString();
	let format = extName.replace(".", "");
	console.log(format);
	const file64 = parser.format(extName, file.buffer);

	let res = {};
	if (public_id) {
		res = await cloudinary.v2.uploader.upload(file64.content, { use_filename: true, format, resource_type: resource_type, public_id });
	} else {
		res = await cloudinary.v2.uploader.upload(file64.content, { folder: folder, format, resource_type: resource_type, use_filename: true });
	}

	return { public_id: res.public_id, url: res.secure_url };
}

async function deleteFile(public_id) {
	await cloudinary.uploader.destroy(public_id);
	return true;
}

module.exports = { getSecuredUrl, deleteFile };
