const asyncHandler = require("express-async-handler");

const admin = asyncHandler(async (req, res, next) => {
	if (!req.user?.is_admin) {
		res.status(401);
		throw new Error("User is not authorized to perform this action");
	}
	next();
});

module.exports = admin;
