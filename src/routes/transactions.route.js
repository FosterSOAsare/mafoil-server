const express = require("express");
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");

const user = require("../middlewares/user.middleware");
const admin = require("../middlewares/admin.middleware");
const transactionsRouter = express.Router();
const Transaction = require("../schemas/Transaction.schema");
const User = require("../schemas/User.schema");
const Notification = require("../schemas/Notification.schema");
const HttpError = require("../utils/http-error");
const { getPagination } = require("../utils/validate");

const TRANSACTION_STATUSES = ["pending", "completed", "cancelled"];
// Only known statuses filter the list; anything else (including "all") lists every status
const statusFilter = (filter) => (TRANSACTION_STATUSES.includes(filter) ? { status: filter } : {});

const formatGhs = (amount) => `GH₵${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getTxns = asyncHandler(async (req, res) => {
	const { limit, skip } = getPagination(req.query, { defaultLimit: 20 });
	const txns = await Transaction.find({ user: req.user._id, ...statusFilter(req.query.filter) }, { __v: 0, user: 0, updatedAt: 0 })
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit);
	res.status(200).json(txns);
});
const getATxn = asyncHandler(async (req, res) => {
	let { id } = req.params;
	if (!mongoose.isValidObjectId(id)) {
		res.status(404);
		throw new Error("The transaction does not exist");
	}

	// Admins see any transaction with its owner's name and email; users only see their own
	const txn = req.user.is_admin
		? await Transaction.findOne({ _id: id }, { __v: 0, updatedAt: 0 }).populate({ path: "user", model: User, select: "email fullname" })
		: await Transaction.findOne({ _id: id, user: req.user._id }, { __v: 0, updatedAt: 0, user: 0 });
	if (!txn) {
		res.status(404);
		throw new Error("The transaction does not exist");
	}
	res.status(200).json(txn);
});
const getAllTxns = asyncHandler(async (req, res) => {
	const { limit, skip } = getPagination(req.query);
	const txns = await Transaction.find(statusFilter(req.query.filter), { __v: 0, updatedAt: 0 })
		.populate({ path: "user", model: User, select: "email fullname" })
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit);
	res.status(200).json(txns);
});

// Admin decision on a pending withdrawal. "approve" marks it completed (the money was already held);
// "reject" marks it cancelled and refunds the held amount. The pending check makes each decision happen once.
const decideWithdrawal = (decision) =>
	asyncHandler(async (req, res) => {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			res.status(404);
			throw new Error("The transaction does not exist");
		}

		let updated;
		await mongoose.connection.transaction(async (session) => {
			updated = await Transaction.findOneAndUpdate(
				{ _id: id, type: "withdraw", status: "pending" },
				{ $set: { status: decision === "approve" ? "completed" : "cancelled" } },
				{ session, new: true }
			);
			if (!updated) {
				const exists = await Transaction.exists({ _id: id }).session(session);
				throw new HttpError(exists ? 409 : 404, exists ? "This withdrawal is not pending" : "The transaction does not exist");
			}

			if (decision === "reject") {
				await User.updateOne({ _id: updated.user }, { $inc: { balance: updated.amount } }, { session });
				await Transaction.create([{ type: "deposit", amount: updated.amount, status: "completed", desc: "Withdrawal rejected - refund", user: updated.user }], { session });
			}
			await Notification.create(
				[
					{
						link: "/account/transactions",
						user: updated.user,
						desc:
							decision === "approve"
								? `Your withdrawal of ${formatGhs(updated.amount)} has been approved and sent.`
								: `Your withdrawal of ${formatGhs(updated.amount)} was rejected and the amount has been returned to your balance.`,
					},
				],
				{ session }
			);
		});

		res.status(200).json({ success: true, status: updated.status });
	});

transactionsRouter.get("/", user, getTxns);
transactionsRouter.get("/admin", user, admin, getAllTxns);
transactionsRouter.get("/:id", user, getATxn);
transactionsRouter.put("/:id/approve", user, admin, decideWithdrawal("approve"));
transactionsRouter.put("/:id/reject", user, admin, decideWithdrawal("reject"));

module.exports = transactionsRouter;
