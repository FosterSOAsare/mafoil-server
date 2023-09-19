const express = require("express");
const {
	controllerGetUser,
	controllerUpdateUserData,
	controllerUpdateUserPassword,
	controllerUpdateNewsLetterSubscription,
	controllerDeleteAccount,
	controllerActivateAccount,
} = require("./user.controller");
const user = require("../../middlewares/user.middleware");

const userRouter = express.Router();

userRouter.get("/", user, controllerGetUser);

userRouter.put("/details", user, controllerUpdateUserData);
userRouter.put("/password", user, controllerUpdateUserPassword);

userRouter.delete("", user, controllerDeleteAccount);
userRouter.put("/newsletter", user, controllerUpdateNewsLetterSubscription);
userRouter.get("/activate", user, controllerActivateAccount);
module.exports = userRouter;
