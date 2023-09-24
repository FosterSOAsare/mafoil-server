const asyncHandler = require("express-async-handler");
const User = require("../schemas/User.schema");
const { checkElapsedTime } = require("../utils/checkElapsedTime");

const deleteUnverifiedUser = asyncHandler(async () => {
	// Fetch unverified users
	const unverifiedUsers = await User.find({ $or: [{ verified: false }, { verified: { $exists: false } }] }, { createdAt: 1 });

	// Filter users whose registration date is more than 2 hours
	let filtered = unverifiedUsers
		.filter((user) => {
			return checkElapsedTime(user.createdAt, 3600 * 2);
		})
		.map((user) => user._id);
	await User.deleteMany({ _id: { $in: filtered } });
	console.log("All unverified email deleted completely...");
});

module.exports = deleteUnverifiedUser;
