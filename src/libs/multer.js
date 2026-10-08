const multer = require("multer");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

function createCloudinaryUpload() {
	const storage = multer.memoryStorage({});
	let upload = multer({
		storage: storage,
		limits: { fileSize: MAX_FILE_SIZE, files: 1 },
		fileFilter: (req, file, cb) => {
			if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
				const error = new Error("Only JPEG, PNG, WebP, GIF and AVIF images can be uploaded");
				error.status = 400;
				return cb(error);
			}
			cb(null, true);
		},
	});
	return upload;
}

const upload = createCloudinaryUpload();

module.exports = { upload, MAX_FILE_SIZE };
