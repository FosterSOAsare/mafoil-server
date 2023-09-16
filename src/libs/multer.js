const multer = require("multer");

function createCloudinaryUpload() {
	const storage = multer.memoryStorage({});
	let upload = multer({ storage: storage });
	return upload;
}

const upload = createCloudinaryUpload();

module.exports = { upload };
