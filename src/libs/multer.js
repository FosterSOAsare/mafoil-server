const multer = require("multer");

function createCloudinaryUpload() {
	const storage = multer.memoryStorage({});
	let upload = multer({ storage: storage });
	return upload;
}

const uploadToCloudinary = createCloudinaryUpload();

module.exports = { uploadToCloudinary };
