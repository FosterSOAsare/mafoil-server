const express = require("express");

const authRouter = require("./auth/auth.router");
const userRouter = require("./user/user.router");

const appRouter = express.Router();

appRouter.use("/auth", authRouter);
appRouter.use("/user", userRouter);

module.exports = appRouter;
