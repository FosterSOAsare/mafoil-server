const mongoose = require("mongoose");

const User = require("../schemas/User.schema");
const Notification = require("../schemas/Notification.schema");
const Order = require("../schemas/Order.schema");
const Transaction = require("../schemas/Transaction.schema");
const { roundMoney } = require("../utils/money");

const BATCH_SIZE = 100;

// Completes one order and pays out price + profit. The pending -> completed update is conditional,
// so an order can never be paid twice even if two runs overlap.
async function completeOrder(orderId) {
	await mongoose.connection.transaction(async (session) => {
		const order = await Order.findOneAndUpdate({ _id: orderId, status: "pending" }, { $set: { status: "completed", completionDate: new Date() } }, { session, new: true });
		if (!order) return; // Already completed or cancelled

		const total = roundMoney(order.totalPrice + order.totalProfit);
		await User.updateOne({ _id: order.user }, { $inc: { balance: total } }, { session });
		await Transaction.create([{ type: "deposit", amount: total, status: "completed", desc: "Order finalization", user: order.user }], { session });
		await Notification.create([{ link: `/orders/${order._id}`, user: order.user, desc: "Your order has been completed." }], { session });
	});
}

// Finalises every pending order whose end date has passed, in batches
const finalizeOrder = async () => {
	try {
		const failed = []; // Skipped for the rest of this run so a failing order can't loop forever
		let orders;
		do {
			orders = await Order.find({ status: "pending", endDate: { $lt: new Date() }, _id: { $nin: failed } }, { _id: 1 }).limit(BATCH_SIZE);
			for (const { _id } of orders) {
				try {
					await completeOrder(_id);
				} catch (e) {
					failed.push(_id);
					console.error(`finalise-order failed for order ${_id}:`, e.message);
				}
			}
		} while (orders.length === BATCH_SIZE);
	} catch (e) {
		console.error("finalise-order failed:", e.message);
	}
};

module.exports = finalizeOrder;
