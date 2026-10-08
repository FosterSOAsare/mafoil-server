require("dotenv").config();
const { validateEnv } = require("./libs/env");
validateEnv();

const http = require("http");

const app = require("./app");
const { connectDB, disconnectDB } = require("./libs/mongoose");
const runCron = require("./cron-jobs");

const server = http.createServer(app);
const PORT = process.env.PORT || 8000;

async function start() {
	// Connect before accepting requests, so no request is served without a database
	await connectDB();
	// With several instances, set RUN_CRONS=false on all but one. The jobs are safe to run concurrently
	// (order payouts are conditional updates), this just avoids duplicate work.
	const tasks = process.env.RUN_CRONS === "false" ? [] : runCron();
	server.listen(PORT, () => {
		console.log(`Server listening on PORT ${PORT}...`);
	});

	let shuttingDown = false;
	async function shutdown(signal) {
		if (shuttingDown) return;
		shuttingDown = true;
		console.log(`${signal} received, shutting down...`);
		tasks.forEach((task) => task.stop());
		// Stop accepting new connections and let in-flight requests finish
		server.close(async () => {
			await disconnectDB();
			process.exit(0);
		});
		// Force exit if connections don't close in time
		setTimeout(() => process.exit(1), 10000).unref();
	}
	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
	console.error("Unhandled promise rejection:", reason);
});

start().catch((err) => {
	console.error("Failed to start server:", err);
	process.exit(1);
});
