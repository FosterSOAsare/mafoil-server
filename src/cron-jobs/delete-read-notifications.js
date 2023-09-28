const Notification = require("../schemas/Notification.schema");
const { checkElapsedTime } = require("../utils/checkElapsedTime");

const deleteReadNotifications = async () => {
	try {
		// Fetch notifications
		const notifications = await Notification.find({ status: "read" }, { createdAt: 1 });

		// Filter read notifications whose date is more than 2 days
		let filtered = notifications
			.filter((notification) => {
				return checkElapsedTime(notification.createdAt, 3600 * 48);
			})
			.map((notification) => notification._id);
		await Notification.deleteMany({ _id: { $in: filtered } });
		// console.log("All read notifications deleted completely...");
	} catch (e) {
		console.log(e.message);
	}
};

module.exports = deleteReadNotifications;
