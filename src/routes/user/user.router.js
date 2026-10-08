const express = require("express");
const {
	controllerGetUser,
	controllerUpdateUserData,
	controllerUpdateUserPassword,
	controllerUpdateNewsLetterSubscription,
	controllerDeleteAccount,
	controllerActivateAccount,
	controllerWithdrawFunds,
	controllerGenerateCheckoutSession,
	controllerValidateCheckoutSession,
} = require("./user.controller");
const user = require("../../middlewares/user.middleware");

const userRouter = express.Router();

userRouter.get("/", user, controllerGetUser);
userRouter.put("/details", user, controllerUpdateUserData);
userRouter.put("/password", user, controllerUpdateUserPassword);
userRouter.delete("", user, controllerDeleteAccount);
userRouter.put("/newsletter", user, controllerUpdateNewsLetterSubscription);
userRouter.post("/activate", user, controllerActivateAccount);
userRouter.post("/withdraw", user, controllerWithdrawFunds);
userRouter.post("/deposit-checkout", user, controllerGenerateCheckoutSession);
userRouter.put("/validate-checkout", user, controllerValidateCheckoutSession);

module.exports = userRouter;
