const express = require("express");
const {
	controllerAuthLocalLogin,
	controllerAuthLocalRegister,
	controllerResetPassword,
	controllerConfirmReset,
	controllerChangePassword,
	controllerGetUser,
	controllerLogoutUser,
	controllerVerifyEmail,
	controllerResendEmail,
} = require("./auth.controller");
const user = require("../../middlewares/user.middleware");

const authRouter = express.Router();

authRouter.post("/login", controllerAuthLocalLogin);
authRouter.post("/register", controllerAuthLocalRegister);
authRouter.post("/resetPassword", controllerResetPassword);
authRouter.post("/confirmReset", controllerConfirmReset);
authRouter.post("/changePassword", controllerChangePassword);
authRouter.post("/verifyEmail", controllerVerifyEmail);
authRouter.post("/resendEmail", controllerResendEmail);

authRouter.get("/user", user, controllerGetUser);

// POST so it can't be triggered by a link or image; auth is a stateless JWT, so no login is needed to log out
authRouter.post("/logout", controllerLogoutUser);

module.exports = authRouter;
