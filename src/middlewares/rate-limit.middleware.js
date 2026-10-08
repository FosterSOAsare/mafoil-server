const { rateLimit } = require("express-rate-limit");

const MINUTE = 60 * 1000;

// Read per request so tests can switch limits off and on
const skip = () => process.env.DISABLE_RATE_LIMITS === "true";

const emailOf = (req) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "");

function limiter({ windowMs, limit, message, byEmail = false }) {
	return rateLimit({
		windowMs,
		limit,
		standardHeaders: "draft-7",
		legacyHeaders: false,
		skip,
		// Per-account limiters are keyed by email alone, since IPs are unreliable (shared, proxied or rotated).
		// Requests without an email fall back to the IP so they don't all share one bucket (they fail validation anyway).
		keyGenerator: byEmail ? (req) => (emailOf(req) ? `email:${emailOf(req)}` : `ip:${req.ip}`) : (req) => req.ip,
		message: { error: message },
	});
}

const TOO_MANY_ATTEMPTS = "Too many attempts. Please try again later.";
const TOO_MANY_EMAILS = "Too many emails requested. Please try again later.";

module.exports = {
	// Password guessing on one account
	loginLimiter: limiter({ windowMs: 15 * MINUTE, limit: 10, byEmail: true, message: TOO_MANY_ATTEMPTS }),
	// Account creation from one client
	registerLimiter: limiter({ windowMs: 60 * MINUTE, limit: 10, message: TOO_MANY_ATTEMPTS }),
	// Endpoints that send an email: per account, and per client overall (email bombing)
	emailPerAccountLimiter: limiter({ windowMs: 60 * MINUTE, limit: 5, byEmail: true, message: TOO_MANY_EMAILS }),
	emailPerClientLimiter: limiter({ windowMs: 60 * MINUTE, limit: 20, message: TOO_MANY_EMAILS }),
	// Code and reset-token checks (each code also allows only 5 guesses)
	verifyLimiter: limiter({ windowMs: 15 * MINUTE, limit: 20, message: TOO_MANY_ATTEMPTS }),
	// Contact form: no login required, so limit messages to the support inbox
	contactLimiter: limiter({ windowMs: 60 * MINUTE, limit: 5, message: "Too many messages sent. Please try again later." }),
};
