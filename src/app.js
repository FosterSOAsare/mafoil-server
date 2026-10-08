const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const mongoose = require("mongoose");

const error = require("./middlewares/error.middleware");
const sanitize = require("./middlewares/sanitize.middleware");
const appRouter = require("./routes");

const app = express();
// Behind Render's proxy: use the first X-Forwarded-For hop as the client IP (needed for rate limiting)
app.set("trust proxy", 1);
// The API is called cross-origin by the client, so allow its JSON responses to be read from other origins
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "100kb" }));
app.use(sanitize);

app.use(
	cors({
		origin: process.env?.NODE_ENV === "production" ? ["https://mafoil.vercel.app", "https://crons-gd5m.onrender.com"] : "*",
	})
);
app.use(morgan("combined", { skip: () => process.env.NODE_ENV === "test" }));
app.use("/api", appRouter);

app.get("/", (req, res) => {
	res.json({ success: true });
});

// Used by the Docker HEALTHCHECK and hosting health checks: healthy only while the database is connected
app.get("/health", (req, res) => {
	const connected = mongoose.connection.readyState === 1;
	res.status(connected ? 200 : 503).json({ status: connected ? "ok" : "unavailable", database: connected ? "connected" : "disconnected" });
});
app.use(error);

module.exports = app;
