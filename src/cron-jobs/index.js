var cron = require("node-cron");

const deleteUnverifiedUser = require("./delete-unverified-users");
const finalizeOrder = require("./finalise-order");
const deleteReadNotifications = require("./delete-read-notifications");
const keepServerUp = require("./keep-server-up");

async function runCron() {
	cron.schedule("0,10,20,30,40,50 * * * * *", deleteUnverifiedUser);
	cron.schedule("0,10,20,30,40,50 * * * * *", finalizeOrder);
	cron.schedule("0,10,20,30,40,50 * * * * *", deleteReadNotifications);
	cron.schedule("0,10,20,30,40,50 * * * * *", keepServerUp);
}

module.exports = runCron;
