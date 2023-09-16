const express = require("express");

const authRouter = require("./auth/auth.router");
const userRouter = require("./user/user.router");
const productsRouter = require("./products/products.router");
const filesRouter = require("./file.route");
const cartRouter = require("./cart.route");
const wishlistRouter = require("./wishlist.route");

const appRouter = express.Router();

appRouter.use("/auth", authRouter);
appRouter.use("/user", userRouter);
appRouter.use("/products", productsRouter);
appRouter.use("/files", filesRouter);
appRouter.use("/cart", cartRouter);
appRouter.use("/wishlist", wishlistRouter);

module.exports = appRouter;
