const cron = require("node-cron");

const deleteUnverifiedUser = require("./delete-unverified-users");
const finalizeOrder = require("./finalise-order");
const deleteReadNotifications = require("./delete-read-notifications");

// Every job runs once a minute; noOverlap skips a run while the previous one is still going
function runCron() {
	const options = { noOverlap: true };
	return [
		cron.schedule("* * * * *", deleteUnverifiedUser, { ...options, name: "delete-unverified-users" }),
		cron.schedule("* * * * *", finalizeOrder, { ...options, name: "finalise-order" }),
		cron.schedule("* * * * *", deleteReadNotifications, { ...options, name: "delete-read-notifications" }),
	];
}

module.exports = runCron;
