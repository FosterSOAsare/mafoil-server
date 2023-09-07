require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connection.on("error", (err) => {
	console.log(err);
});

mongoose.connection.once("open", () => {
	console.log("Mongoose connection started");
});

async function connectDB() {
	await mongoose.connect(process.env.MONGO_URL);
}

async function disconnectDB() {
	mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
