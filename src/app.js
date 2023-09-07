const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
// const helmet = require("helmet");
const appRouter = require("./routes");

console.log(appRouter);

const app = express();

app.use(cors());
app.use(morgan("combined"));
app.use("/api", appRouter);

app.get("/", (req, res) => {
	res.json({ success: true });
});

module.exports = app;
