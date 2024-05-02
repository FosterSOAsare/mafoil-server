const express = require("express");
const {
	getProducts,
	getAProduct,
	deleteAProduct,
	updateAProduct,
	createAProduct,
	getProductForEdit,
	fetchCategoriesInfo,
	getProductRecommendations,
	getRecentProducts,
	searchProducts,
} = require("./products.controller");

const productsRouter = express.Router();
const user = require("../../middlewares/user.middleware");
const admin = require("../../middlewares/admin.middleware");

productsRouter.get("/", getProducts);
productsRouter.get("/edit/:slugname", getProductForEdit);
productsRouter.get("/search", searchProducts);
productsRouter.get("/categories", fetchCategoriesInfo);
productsRouter.get("/:slugname", getAProduct);
productsRouter.delete("/", user, admin, deleteAProduct);
productsRouter.put("/:slugname", user, admin, updateAProduct);
productsRouter.get("/:slugname/recommendations", getProductRecommendations);
productsRouter.post("/recents", getRecentProducts);
productsRouter.post("/", user, admin, createAProduct);

module.exports = productsRouter;
