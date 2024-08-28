const { connectDB, disconnectDB } = require("../../libs/mongoose");
let request = require("supertest");
const app = require("../../app");
request = request(app);

const authorization =
	"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NTEwMDdlNGExYWJmYjQwMjE4MGQ2NzUiLCJlbWFpbCI6ImFzYXJlNHN0ZXJAZ21haWwuY29tIiwiaWF0IjoxNzI0NjA1OTU4LCJleHAiOjE3MjcxOTc5NTh9.xIpX9BpUdVqz08ykraE6SN4_hDytVYjgByOx9d_YsOA";
const postId = "";

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

	test("Should return a success response when slugname is valid", async () => {
		const response = await request.get("/api/products/short-sleeve-sweater").expect(200);
	});

	test("Search For A Product", async () => {
		const response = await request.get("/api/products/search?searchText=short").expect(200);
		expect(response.body).toBeTruthy();
	});

	test("Get Category Info On Number Of Clothes", async () => {
		const response = await request.get("/api/products/categories").expect(200).expect("Content-Type", /json/);
		expect(response.body.cloth).toBeDefined();
		expect(response.body.shoe).toBeDefined();
		expect(response.body.accessories).toBeDefined();
	});
});

describe("POST A PRODUCT", () => {
	test("Should return forbidden when user is not authorized", async () => {
		await request.post("/api/products").send({ name: "Asare", price: "56.89", category: "Shirt", store: "Tyes" }).expect(403);
	});

	test("Should return an error when data is not sent with all required fields", async () => {
		const response = await request.post("/api/products").set("Authorization", authorization).send({ name: "Asare", price: "56.89", category: "Shirt", store: "Tyes" }).expect(400);

		expect(response.body).toBeDefined();
		expect(response.body).toMatchObject({ error: "Please provide all necessary information" });
	});
});

afterAll(async () => {
	await disconnectDB();
});
