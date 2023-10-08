var cron = require("node-cron");

const deleteUnverifiedUser = require("./delete-unverified-users");
const finalizeOrder = require("./finalise-order");
const deleteReadNotifications = require("./delete-read-notifications");

const { connectDB } = require("../libs/mongoose");

async function runCron() {
	await connectDB();
	cron.schedule("0,10,20,30,40,50 * * * * *", deleteUnverifiedUser);
	cron.schedule("0,10,20,30,40,50 * * * * *", finalizeOrder);
	cron.schedule("0,10,20,30,40,50 * * * * *", deleteReadNotifications);
}

runCron();
