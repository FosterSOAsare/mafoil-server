require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connection.once("open", () => {
	console.log("Database connection successfully established");
});

mongoose.connection.on("error", (e) => {
	console.log(`An error occurred while connecting ${e.message}`);
});
mongoose.connection.on("disconnected", () => {
	console.log(`Disconnected from Database succesfully...`);
});
async function connectDB() {
	await mongoose.connect(process.env.MONGO_URL);
}

async function disconnectDB() {
	await mongoose.disconnect();
	
}

module.exports = { connectDB, mongoose, disconnectDB };
