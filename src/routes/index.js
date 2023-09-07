const express = require("express");

const authRouter = require("./auth/auth.router");

const appRouter = express.Router();

appRouter.use("/auth", authRouter);

module.exports = appRouter;
