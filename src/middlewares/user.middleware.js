const mongoose = require("mongoose");
const User = require("../schemas/User.schema");
const { verifyToken, getBearerToken } = require("../libs/auth-token");

const NOT_LOGGED_IN = "Please log in to perform this request";

// Verifies the JWT and loads the user into req.user for the rest of the request (one database read).
// Tokens issued before the user's last password change, reset or logout are rejected (token version).
const user = async (req, res, next) => {
	const payload = verifyToken(getBearerToken(req));
	if (!payload?.userId || !mongoose.isValidObjectId(payload.userId)) {
		return res.status(401).json({ error: NOT_LOGGED_IN });
	}

	try {
		const account = await User.findOne({ _id: payload.userId }, { email: 1, fullname: 1, activated: 1, balance: 1, is_admin: 1, tokenVersion: 1 });
		// Tokens from before tokenVersion existed carry no `tv`; they match version 0
		if (!account || (payload.tv || 0) !== (account.tokenVersion || 0)) {
			return res.status(401).json({ error: NOT_LOGGED_IN });
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
