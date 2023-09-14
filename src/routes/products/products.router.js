const express = require("express");
const { getProducts, getAProduct, deleteAProduct, updateAProduct, createAProduct } = require("./products.controller");

const productsRouter = express.Router();

productsRouter.get("/", getProducts);
productsRouter.get("/:productId", getAProduct);
productsRouter.delete("/", deleteAProduct);
productsRouter.put("/:productId", updateAProduct);
productsRouter.post("/", createAProduct);

module.exports = productsRouter;
