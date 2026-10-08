// Error carrying an HTTP status code. Throwing it inside a transaction aborts the transaction,
// and the error middleware responds with err.status.
class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.name = "HttpError";
		this.status = status;
	}
}

module.exports = HttpError;
