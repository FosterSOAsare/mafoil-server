const express = require("express");
const {
	verifyAuth,
	controllerAuthLocalLogin,
	controllerAuthLocalRegister,
	controllerResetPassword,
	controllerConfirmReset,
	controllerChangePassword,
	controllerGetUser,
	controllerLogoutUser,
	controllerVerifyEmail,
	controllerResendEmail,
	controllerUpdateUserData,
	controllerUpdateUserPassword,
	controllerUpdateNewsLetterSubscription,
	controllerDeleteAccount,
} = require("./auth.controller");
const user = require("../../middlewares/user.middleware");

const authRouter = express.Router();

// authRouter.get("/verify", user, verifyAuth);

authRouter.post("/login", controllerAuthLocalLogin);
authRouter.post("/register", controllerAuthLocalRegister);
authRouter.post("/resetPassword", controllerResetPassword);
authRouter.post("/confirmReset", controllerConfirmReset);
authRouter.post("/changePassword", controllerChangePassword);
authRouter.post("/verifyEmail", controllerVerifyEmail);
authRouter.post("/resendEmail", controllerResendEmail);

authRouter.get("/user", user, controllerGetUser);

authRouter.get("/logout", user, controllerLogoutUser);

// authRouter.put("/userDetails", user, controllerUpdateUserData);
// authRouter.put("/userPassword", user, controllerUpdateUserPassword);

// authRouter.delete("/user", user, controllerDeleteAccount);
// authRouter.put("/user/newsletter", user, controllerUpdateNewsLetterSubscription);
module.exports = authRouter;
