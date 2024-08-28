const { connectDB, disconnectDB } = require("../../libs/mongoose");
let request = require("supertest");
const app = require("../../app");
request = request(app);

beforeAll(async () => {
	await connectDB();
}, 200000);

describe("GET PRODUCTS", () => {
	test("/Should return products", async () => {
		const response = await request.get("/api/products");
		expect(response.statusCode).toEqual(200);
		expect(response.text).toBeTruthy();
	});
});

describe("GET A PRODUCT", () => {
	test("/Should return an error since slugname is invalid", async () => {
		const response = await request.get("/api/products/get-slugname");
		expect(response.statusCode).toEqual(404);
	});
});

afterAll(async () => {
	await disconnectDB();
});
