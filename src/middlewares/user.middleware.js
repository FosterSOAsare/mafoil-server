const asyncHandler = require("express-async-handler");
const User = require("../schemas/User.schema");

const user = asyncHandler(async (req, res, next) => {
	// req.session.user = {
	// 	_id: "647afeaf8309c6c8268eb26b",
	// };

	if (!req?.session?.user) {
		res.status(401);
		throw new Error("User not authorized");
	}
	let response = await User.findOne({ _id: req.session.user._id });
	// console.log(response);
	req.session.user = { ...req.session.user, subscribed: true };
	next();
});

module.exports = user;
