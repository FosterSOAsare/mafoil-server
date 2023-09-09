const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const session = require('express-session')

const error = require("./middlewares/error.middleware");

// const helmet = require("helmet");
const appRouter = require("./routes");

const app = express();
app.use(express.json());

let initialObj = {
	secret: "thisisascretkeythatwillbechangedsoon",
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		sameSite: "strict",
	},
};
app.use(session(initialObj));

app.use(cors());
app.use(morgan("combined"));
app.use("/api", appRouter);

app.get("/", (req, res) => {
	res.json({ success: true });
});
app.use(error);

module.exports = app;
