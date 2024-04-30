const express = require("express");
const asyncHandler = require("express-async-handler");

const user = require("../middlewares/user.middleware");
const admin = require("../middlewares/admin.middleware");
const transactionsRouter = express.Router();
const Transaction = require("../schemas/Transaction.schema");

const getTxns = asyncHandler(async (req, res) => {
	let { filter } = req.query;

	filter = filter ? filter : "all";

	let obj = { user: req.session.user._id };
	if (filter !== "all") {
		obj = { ...obj, status: filter };
	}
	// await Transaction.updateMany({ status: "complete" }, { $set: { status: "completed" } });
	let txns = await Transaction.find(obj, { __v: 0, user: 0, updatedAt: 0 }).sort({ createdAt: -1 }).limit(20);
	res.status(200).json(txns);
});
const getATxn = asyncHandler(async (req, res) => {
	let { id } = req.params;

	let txn = await Transaction.findOne({ _id: id }, { __v: 0, user: 0, updatedAt: 0 }).sort({ createdAt: -1 });
	if (!txn) {
		res.status(404);
		throw new Error("The transaction does not exist");
	}
	res.status(200).json(txn);
});
const getAllTxns = asyncHandler(async (req, res) => {
	let { filter } = req.query;

	filter = filter ? filter : "all";

	let obj = {};
	if (filter !== "all") {
		obj = { ...obj, status: filter };
	}

	let txns = await Transaction.find(obj, { __v: 0, user: 0, updatedAt: 0 }).sort({ createdAt: -1 });
	res.status(200).json(txns);
});

transactionsRouter.get("/", user, getTxns);
transactionsRouter.get("/admin", user, admin, getAllTxns);
transactionsRouter.get("/:id", user, admin, getATxn);

module.exports = transactionsRouter;
