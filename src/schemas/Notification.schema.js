const mongoose = require("mongoose");

const notificationSchema = mongoose.Schema(
	{
		link: {
			// Link to view notifications
			type: String,
			required: true,
		},
		status: {
			type: String,
			enum: ["unread", "read"],
			default: "unread",
		},
		desc: {
			// Description of the notification
			type: String,
			required: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			required: true,
		},
	},
	{
		timestamps: true,
	}
);

// Used by the delete-read-notifications cron and by the user's notification list
notificationSchema.index({ status: 1, createdAt: 1 });
notificationSchema.index({ user: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
