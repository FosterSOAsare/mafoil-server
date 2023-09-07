const asyncHandler = require("express-async-handler");

const controllerRegisterUser = asyncHandler(async (req, res) => {
	res.json({ success: true });
});

module.exports = {
	controllerRegisterUser,
};
