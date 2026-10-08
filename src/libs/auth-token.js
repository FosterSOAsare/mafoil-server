const jwt = require("jsonwebtoken");

const TOKEN_LIFETIME = "30d";

// Signs a login token. `tv` (token version) lets the server invalidate every token issued before a
// password change, reset or logout by incrementing the user's tokenVersion.
function signToken(user) {
	return jwt.sign({ userId: user._id, email: user.email, tv: user.tokenVersion || 0 }, process.env.SECRET, { algorithm: "HS256", expiresIn: TOKEN_LIFETIME });
}

// Returns the token payload, or null if the token is missing, malformed, expired or wrongly signed
function verifyToken(token) {
	try {
		return jwt.verify(token, process.env.SECRET, { algorithms: ["HS256"] });
	} catch (err) {
		return null;
	}
}

function getBearerToken(req) {
	const authorization = req.headers?.authorization;
	return typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
}

module.exports = { signToken, verifyToken, getBearerToken };
