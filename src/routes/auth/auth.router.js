const express = require("express");
const {
	controllerAuthLocalLogin,
	controllerAuthLocalRegister,
	controllerResetPassword,
	controllerConfirmReset,
	controllerGetUser,
	controllerLogoutUser,
	controllerVerifyEmail,
	controllerResendEmail,
} = require("./auth.controller");
const user = require("../../middlewares/user.middleware");
const { loginLimiter, registerLimiter, emailPerAccountLimiter, emailPerClientLimiter, verifyLimiter } = require("../../middlewares/rate-limit.middleware");

const authRouter = express.Router();

authRouter.post("/login", loginLimiter, controllerAuthLocalLogin);
authRouter.post("/register", registerLimiter, emailPerAccountLimiter, controllerAuthLocalRegister);
authRouter.post("/resetPassword", emailPerClientLimiter, emailPerAccountLimiter, controllerResetPassword);
authRouter.post("/resendEmail", emailPerClientLimiter, emailPerAccountLimiter, controllerResendEmail);
authRouter.post("/verifyEmail", verifyLimiter, controllerVerifyEmail);
authRouter.post("/confirmReset", verifyLimiter, controllerConfirmReset);

authRouter.get("/user", user, controllerGetUser);

// POST so it can't be triggered by a link or image. Revokes the caller's token if one is sent.
authRouter.post("/logout", controllerLogoutUser);

module.exports = authRouter;
