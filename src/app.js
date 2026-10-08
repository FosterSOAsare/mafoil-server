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

// CORS_ORIGINS is a comma-separated list of allowed origins. Without it, production allows the deployed client
// and development allows every origin.
const DEFAULT_PRODUCTION_ORIGINS = ["https://mafoil.vercel.app"];
const corsOrigins = process.env.CORS_ORIGINS
	? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
	: process.env.NODE_ENV === "production"
	? DEFAULT_PRODUCTION_ORIGINS
	: "*";
app.use(cors({ origin: corsOrigins }));

// One JSON object per request in production (easy to search in log tools), readable lines in development
const jsonLogFormat = (tokens, req, res) =>
	JSON.stringify({
		time: tokens.date(req, res, "iso"),
		method: tokens.method(req, res),
		url: tokens.url(req, res),
		status: Number(tokens.status(req, res)) || null,
		durationMs: Number(tokens["response-time"](req, res)) || null,
		ip: req.ip,
		userAgent: tokens["user-agent"](req, res),
	});
app.use(morgan(process.env.NODE_ENV === "production" ? jsonLogFormat : "dev", { skip: () => process.env.NODE_ENV === "test" }));
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
