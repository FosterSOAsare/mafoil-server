const express = require("express");

const { controllerRegisterUser } = require("./auth.controller");
const authRouter = express.Router();

authRouter.get("/register", controllerRegisterUser);

module.exports = authRouter;
