const asyncHandler = require("express-async-handler");
const User = require("../schemas/User.schema");
const Newsletter = require("../schemas/Newsletter.schema");

const user = asyncHandler(async (req, res, next) => {
	// req.session.user = {
	// 	_id: "6630bc628e0fc382c3cc4beb",
	// };
	if (!req?.session?.user) {
		res.status(401);
		throw new Error("User not authorized");
	}
	let response = await User.findOne({ _id: req.session.user._id });
	if (!response) {
		await req.session.destroy();
		res.status(401);
		throw new Error("User not authorized");
	}
	const { email, fullname, activated, _id, balance, is_admin } = response;
	const subscribed = await Newsletter.findOne({ email: email });
	req.session.user = { email, fullname, activated, _id, balance, is_admin, subscribed: subscribed ? true : false };
	next();
});

module.exports = user;
