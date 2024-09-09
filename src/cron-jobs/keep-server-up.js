const axios = require("axios");

// Function to make a GET request
async function getMafoilData() {
	try {
		console.log("Getting response from cron...");
		await axios.get("https://crons-gd5m.onrender.com");
		console.log({ message: "Response received from cron", success: true });
	} catch (error) {
		console.error("Error, making GET request:", error.message);
	}
}

// Call the function
module.exports = getMafoilData;
