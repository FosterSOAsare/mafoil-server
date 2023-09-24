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

module.exports = mongoose.model("Notification", notificationSchema);
