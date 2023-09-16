const asyncHandler = require("express-async-handler");
const User = require("../schemas/User.schema");

const user = asyncHandler(async (req, res, next) => {
	// req.session.user = {
	// 	email: "asare4ster@gmail.com",
	// 	fullname: "Asare Foster",
	// 	activated: false,
	// 	_id: "64fa60388604b60b37ab4901",
	// 	balance: 0,
	// 	subscribed: false,
	// 	is_admin: false,
	// };

	if (!req?.session?.user) {
		res.status(401);
		throw new Error("User not authorized");
	}
	// let response = await User.findOne({ _id: req.session.user._id });
	// if (!response) {
	// 	await req.session.destroy();
	// 	res.status(401);
	// 	throw new Error("User not authorized");
	// }
	// const { email, fullname, activated, _id, balance, subscribed } = response;
	// req.session.user = { email, fullname, activated, id: _id, balance, subscribed };
	next();
});

module.exports = user;
