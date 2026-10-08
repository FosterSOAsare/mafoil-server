const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const error = require("./middlewares/error.middleware");

// const helmet = require("helmet");
const appRouter = require("./routes");

const app = express();
// Behind Render's proxy: use the first X-Forwarded-For hop as the client IP (needed for rate limiting)
app.set("trust proxy", 1);
app.use(express.json());

app.use(
	cors({
		origin: process.env?.NODE_ENV === "production" ? ["https://mafoil.vercel.app", "https://crons-gd5m.onrender.com"] : "*",
	})
);
app.use(morgan("combined"));
app.use("/api", appRouter);

app.get("/", (req, res) => {
	res.json({ success: true });
});
app.use(error);

module.exports = app;
