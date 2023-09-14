const express = require("express");

const authRouter = require("./auth/auth.router");
const userRouter = require("./user/user.router");
const productsRouter = require("./products/products.router");
const filesRouter = require("./file.route");

const appRouter = express.Router();

appRouter.use("/auth", authRouter);
appRouter.use("/user", userRouter);
appRouter.use("/products", productsRouter);
appRouter.use("/files", filesRouter);

module.exports = appRouter;
