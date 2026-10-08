const jwt = require("jsonwebtoken");
const User = require("../schemas/User.schema");

// Verifies the JWT and loads the user into req.user for the rest of the request (one database read)
const user = async (req, res, next) => {
	const authorization = req.headers?.authorization;
	if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
		return res.status(401).json({ error: "Please log in to perform this request" });
	}

	let payload;
	try {
		payload = jwt.verify(authorization.slice(7), process.env.SECRET, { algorithms: ["HS256"] });
	} catch (err) {
		return res.status(401).json({ error: "Please log in to perform this request" });
	}
	if (!payload?.userId) {
		return res.status(401).json({ error: "Please log in to perform this request" });
	}

	try {
		const account = await User.findOne({ _id: payload.userId }, { email: 1, fullname: 1, activated: 1, balance: 1, is_admin: 1 });
		if (!account) {
			return res.status(401).json({ error: "Please log in to perform this request" });
		}
		const { email, fullname, activated, _id, balance, is_admin } = account;
		req.user = { email, fullname, activated, _id, balance, is_admin };
	} catch (err) {
		// A database failure is a server error, not an authentication failure
		return next(err);
	}
	next();
};

module.exports = user;
