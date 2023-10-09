const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const User = require("../schemas/User.schema");
const Notification = require("../schemas/Notification.schema");
const Order = require("../schemas/Order.schema");
const Transaction = require("../schemas/Transaction.schema");

const finalizeOrder = asyncHandler(async () => {
	// Find all pending order
	const orders = await Order.find({ status: "pending" });
	// Filter to get the elapsed time
	let filtered = orders.filter((order) => {
		let today = new Date().getTime();
		let endDate = new Date(order?.endDate).getTime();
		return endDate < today;
	});

	// Complete one order at a time
	if (filtered?.length === 0) return;
	let order = filtered[0];
	const { user, _id, totalPrice, totalProfit } = order;
	const total = Math.round((totalPrice + totalProfit) * 100) / 100;

	const session = await mongoose.startSession();
	try {
		session.startTransaction();
		const options = { session };

		// Update order to completed
		await Order.updateOne({ _id }, { $set: { status: "completed" } }, options);

		// Insert notification to notify of the completion
		await Notification.create(
			[
				{ link: `/orders/${order._id}`, user, desc: "Your order has been completed." },
				{ link: `/account/transactions`, user, desc: `You received a profit of ${totalProfit} from your order` },
			],
			options
		);

		// Insert a transaction
		await Transaction.create([{ type: "deposit", amount: total, status: "completed", desc: "Order finalization", user }], options);

		// Update user's balance
		await User.updateOne({ _id: user }, { $inc: { balance: total } }, options);

		await session.commitTransaction();
		session.endSession();

		// console.log("Order finalization was successful");
	} catch (e) {
		await session.abortTransaction();
		session.endSession();
	}
});

module.exports = finalizeOrder;
