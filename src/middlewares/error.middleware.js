// Converts thrown errors into { error: message } JSON responses
function errors(err, req, res, next) {
	if (res.headersSent) return next(err);

	if (err?.status) res.status(err.status);
	// Invalid input caught by Mongoose (schema validators, bad ObjectIds) is a client error
	if (err?.name === "ValidationError" || err?.name === "CastError") res.status(400);
	// Unique index violation
	if (err?.code === 11000) res.status(409);
	if (res.statusCode < 400) res.status(500);

	const isServerError = res.statusCode >= 500;
	const messages = {
		ValidationError: "The provided data is invalid",
		CastError: "The provided data is invalid",
	};
	let message = err?.code === 11000 ? "This record already exists" : messages[err?.name] || err?.message;
	// Don't leak internal error details (database, library messages) for unexpected failures
	if (isServerError && !err?.expose) message = "Something went wrong. Please try again later.";

	if (isServerError) console.error(err);
	res.json({ error: message });
}

module.exports = errors;
