const User = require("../schemas/User.schema");

const MAX_UNVERIFIED_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

// Deletes accounts whose email was not verified within 2 hours of registering
const deleteUnverifiedUser = async () => {
	try {
		const cutoff = new Date(Date.now() - MAX_UNVERIFIED_AGE_MS);
		await User.deleteMany({ verified: { $ne: true }, createdAt: { $lt: cutoff } });
	} catch (e) {
		console.error("delete-unverified-users failed:", e.message);
	}
};

module.exports = deleteUnverifiedUser;
