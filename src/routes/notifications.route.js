const express = require("express");
const user = require("../middlewares/user.middleware");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Notification = require("../schemas/Notification.schema");

const notificationsRouter = express.Router();

const controllerGetNotifications = asyncHandler(async (req, res) => {
	// Capped: read notifications are deleted after 2 days, so this is the recent history
	const notifications = await Notification.find({ user: req.user._id }, { __v: 0, updatedAt: 0, createdAt: 0, user: 0 }).sort({ createdAt: -1 }).limit(100);

	// Group notifications based on status
	let priority = { read: 2, unread: 1 };
	notifications.sort((a, b) => priority[a.status] - priority[b.status]);

	res.status(200).json(notifications);
});

const controllerMarkNotificationAsRead = asyncHandler(async (req, res) => {
	const { notificationId } = req.params;
	if (!mongoose.isValidObjectId(notificationId)) {
		res.status(404);
		throw new Error("Notification does not exist");
	}

	// Scoped to the logged-in user, so other users' notifications can't be read or changed
	const notification = await Notification.findOneAndUpdate(
		{ _id: notificationId, user: req.user._id },
		{ $set: { status: "read" } },
		{ new: true, projection: { __v: 0, updatedAt: 0, createdAt: 0, user: 0 } }
	);
	if (!notification) {
		res.status(404);
		throw new Error("Notification does not exist");
	}

	res.status(200).json(notification);
});
notificationsRouter.get("/", user, controllerGetNotifications);
notificationsRouter.put("/:notificationId/read", user, controllerMarkNotificationAsRead);

module.exports = notificationsRouter;
