require("dotenv").config();
function errors(err, req, res, next) {
	res.statusCode === 200 && res.status(500);
	let errs = ["InternalOAuthError", "TokenError", "AuthenticationError", "AuthorizationError", "ValidationError", "ProviderError"];
	if (err) {
		if (errs.includes(err.name)) {
			res.redirect(`${process.env.CLIENT_URL}/auth/login?error=${err.name}&errorType=oauth`);
			return;
		}
		res.json({ error: err.message });
	}
	console.log({ error: err });
}

module.exports = errors;
