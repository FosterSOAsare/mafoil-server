const express = require("express");
const user = require("../middlewares/user.middleware");
const asyncHandler = require("express-async-handler");
const Notification = require("../schemas/Notification.schema");

const notificationsRouter = express.Router();

const controllerGetNotifications = asyncHandler(async (req, res) => {
	const notifications = await Notification.find({ user: req.session.user._id }, { __v: 0, updatedAt: 0, createdAt: 0, user: 0 }).sort({ createdAt: -1 });

	// Group notifications based on status
	let priority = { read: 2, unread: 1 };
	notifications.sort((a, b) => priority[a.status] - priority[b.status]);

	res.status(200).json(notifications);
});

const controllerMarkNotificationAsRead = asyncHandler(async (req, res) => {
	const { notificationId } = req.params;
	const notification = await Notification.findOne({ _id: notificationId });

	if (!notification) {
		res.status(404);
		throw new Error("Notification does not exist");
	}

	await Notification.updateOne({ _id: notificationId }, { $set: { status: "read" } });
	res.status(200).json(notification);
});
notificationsRouter.get("/", user, controllerGetNotifications);
notificationsRouter.put("/:notificationId/read", user, controllerMarkNotificationAsRead);

module.exports = notificationsRouter;
