require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connection.once("open", () => {
	console.log("Database connection successfully established");
});

mongoose.connection.on("error", (e) => {
	console.log(`An error occurred while connecting ${e.message}`);
});
async function connectDB() {
	await mongoose.connect(process.env.MONGO_URL);
}

module.exports = { connectDB, mongoose };
