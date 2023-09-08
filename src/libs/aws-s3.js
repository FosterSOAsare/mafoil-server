require("dotenv").config();
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const asyncHandler = require("express-async-handler");
const crypto = require("crypto");

const client = new S3Client({
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY,
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
	},
	region: process.env.AWS_REGION,
});

const generateSecuredUrl = asyncHandler(async (file, public_id) => {
	// Note public_id is the name of the file so that an image gets updated provided itt has a public_id. Name is retained from cloudinary
	let params = {
		Bucket: process.env.S3_BUCKET_NAME,
		Body: file.buffer,
		ContentType: file.mimetype ? file.mimetype : "png",
		Key: public_id,
		Metadata: {
			"Content-Disposition": "inline",
		},
	};
	const command = new PutObjectCommand(params);
	await client.send(command);

	const imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${public_id}`;

	return imageUrl;
});

const deleteFile = asyncHandler(async (public_id) => {
	let params = {
		Bucket: process.env.S3_BUCKET_NAME,
		Key: public_id,
	};
	const command = new DeleteObjectCommand(params);
	let res = await client.send(command);

	return res;
});

const randImageName = (fileType, bytes = 32) => {
	let ext = fileType.split("/")[1];
	return crypto.randomBytes(bytes).toString("hex") + "." + ext;
};

module.exports = { generateSecuredUrl, deleteFile, randImageName };
