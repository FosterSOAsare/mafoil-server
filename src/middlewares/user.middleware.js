const asyncHandler = require("express-async-handler");
const User = require("../schemas/User.schema");
const Newsletter = require("../schemas/Newsletter.schema");
const jwt = require("jsonwebtoken");

const user = asyncHandler(async (req, res, next) => {
	// Jwts will be used here but the value from jwt will be passed to the express-session object
	try {
		if (!req?.headers?.authorization || !req.headers.authorization.startsWith("Bearer ")) {
			res.status(401);
			throw new Error("Please log in to perform this request");
		}
		let token = req?.headers.authorization.split(" ")[1];
		// Compare auth
		let valid = await jwt.verify(token, process.env.SECRET);
		if (!valid.userId || !valid.email) {
			res.status(401);
			throw new Error("Please log in to perform this task");
		}
		// fetch user
		const user = await User.findOne({ _id: valid.userId }, { password: 0, code: 0 });
		if (!user) {
			res.status(401);
			throw new Error("Please log in to perform this task");
		}

		const { email, fullname, activated, _id, balance, is_admin } = user;
		const subscribed = await Newsletter.findOne({ email: email });
		req.session.user = { email, fullname, activated, _id, balance, is_admin, subscribed: subscribed ? true : false };
	} catch (err) {
		res.status(403).json({ error: err.message });
		return;
	}
	next();
});

module.exports = user;
