// Shared input validation helpers for request handlers

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything past 72 bytes

// A string that is non-empty after trimming and at most `max` characters
const isNonEmptyString = (value, max = 1000) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

const isValidEmail = (value) => typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value.trim());

const normalizeEmail = (value) => value.trim().toLowerCase();

const isValidPassword = (value) =>
	typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH && Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES;

const PASSWORD_RULE = `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters and at most ${MAX_PASSWORD_BYTES} bytes long`;

// Escapes user input for safe use inside a RegExp
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Parses a whole number from a query string value, clamped to [min, max], falling back to `fallback`
const parseIntInRange = (value, { fallback, min, max }) => {
	const number = Number.parseInt(value, 10);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(Math.max(number, min), max);
};

// Reads ?page=&limit= for list endpoints (defaults: page 1, limit 100, max 100)
const getPagination = (query, { defaultLimit = 100, maxLimit = 100 } = {}) => {
	const limit = parseIntInRange(query.limit, { fallback: defaultLimit, min: 1, max: maxLimit });
	const page = parseIntInRange(query.page, { fallback: 1, min: 1, max: 100000 });
	return { limit, skip: (page - 1) * limit, page };
};

module.exports = {
	EMAIL_PATTERN,
	PASSWORD_RULE,
	isNonEmptyString,
	isValidEmail,
	normalizeEmail,
	isValidPassword,
	escapeRegex,
	parseIntInRange,
	getPagination,
};
