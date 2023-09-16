const express = require("express");
const { getProducts, getAProduct, deleteAProduct, updateAProduct, createAProduct, getProductForEdit, fetchCategoriesInfo } = require("./products.controller");

const productsRouter = express.Router();

productsRouter.get("/", getProducts);
productsRouter.get("/edit/:slugname", getProductForEdit);
productsRouter.get("/categories", fetchCategoriesInfo);
productsRouter.get("/:slugname", getAProduct);
productsRouter.delete("/", deleteAProduct);
productsRouter.put("/:slugname", updateAProduct);
productsRouter.post("/", createAProduct);

module.exports = productsRouter;
