const Notification = require("../schemas/Notification.schema");

const MAX_READ_AGE_MS = 48 * 60 * 60 * 1000; // 2 days

// Deletes read notifications that are more than 2 days old
const deleteReadNotifications = async () => {
	try {
		const cutoff = new Date(Date.now() - MAX_READ_AGE_MS);
		await Notification.deleteMany({ status: "read", createdAt: { $lt: cutoff } });
	} catch (e) {
		console.error("delete-read-notifications failed:", e.message);
	}
};

module.exports = deleteReadNotifications;
