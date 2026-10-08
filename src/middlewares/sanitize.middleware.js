// Removes keys that MongoDB would treat as query operators ($gt, $ne, $where, ...) or as dotted paths
// from all user input, so values like ?filter[$ne]=x or { "email": { "$ne": null } } can't change a query.
const isUnsafeKey = (key) => key.startsWith("$") || key.includes(".") || key === "__proto__" || key === "constructor" || key === "prototype";

function clean(value, depth = 0) {
	if (depth > 20) return undefined;
	if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
	if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
		const result = {};
		for (const key of Object.keys(value)) {
			if (isUnsafeKey(key)) continue;
			result[key] = clean(value[key], depth + 1);
		}
		return result;
	}
	return value;
}

function sanitize(req, res, next) {
	if (req.body && typeof req.body === "object") req.body = clean(req.body);
	if (req.query && typeof req.query === "object") req.query = clean(req.query);
	if (req.params && typeof req.params === "object") req.params = clean(req.params);
	next();
}

module.exports = sanitize;
