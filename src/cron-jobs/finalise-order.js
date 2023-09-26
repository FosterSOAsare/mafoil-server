const asyncHandler = require("express-async-handler");
const Order = require("../schemas/Order.schema");
const { checkElapsedTime } = require("../utils/checkElapsedTime");

const finalizeOrder = asyncHandler(async () => {
	const orders = await Order.find({ status: "pending" });
	// Filter to get the elapsed time
	let filtered = orders
		.filter((order) => {
			let today = new Date().getTime();
			let endDate = new Date(order?.endDate).getTime();
			return endDate > today;
		})
		.map((user) => user._id);

	// Complete order
	// Add transaction for completed order
	// Update user's balance
  // Insert notification to tell user of their profit
});

module.exports = finalizeOrder;
