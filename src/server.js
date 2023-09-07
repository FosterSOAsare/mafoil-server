const http = require("http");

const app = require("./app");
const { connectDB } = require("./libs/mongoose");

const server = http.createServer(app);
const PORT = process.env.PORT || 8000;

(function () {
	server.listen(PORT, async () => {
		await connectDB();
		console.log(`Server listening on PORT ${PORT}...`);
	});
})();
