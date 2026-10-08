// Account deletion, own-transaction access, POST-only state changes, admin status codes, ratings precision
jest.mock("stripe", () => require("./mocks").stripe());
jest.mock("nodemailer", () => require("./mocks").nodemailer());

const { setupTestApp } = require("./helpers");

let t;

beforeAll(async () => {
	t = await setupTestApp();
});
afterAll(() => t.stop());

describe("account deletion", () => {
	test("requires the password and removes personal data", async () => {
		const { user, as } = await t.makeUser({ balance: 0 });
		const Review = t.mongoose.model("Review");
		const product = await t.mongoose.model("Product").create({ name: "P", price: 5, short_desc: "P", slugname: "p-delete", category: "bag" });
		await Review.create({ name: "Test User", email: user.email, rating: 4, title: "Nice", comment: "Good", user: user._id, product: product._id, status: "accepted" });
		await t.mongoose.model("Transaction").create({ user: user._id, type: "withdraw", status: "completed", amount: 5, desc: "Old withdrawal", address: "wallet-1" });
		await t.mongoose.model("Newsletter").create({ email: user.email });

		expect((await as(t.api().delete("/api/user")).send({})).status).toBe(400);
		expect((await as(t.api().delete("/api/user")).send({ password: "wrongpassword" })).status).toBe(400);
		expect((await as(t.api().delete("/api/user")).send({ password: "password123" })).status).toBe(200);

		expect(await t.mongoose.model("User").exists({ _id: user._id })).toBeNull();
		expect(await t.mongoose.model("Newsletter").exists({ email: user.email })).toBeNull();
		const review = await Review.findOne({ user: user._id });
		expect(review).toMatchObject({ name: "Deleted user" });
		expect(review.email).not.toBe(user.email);
		expect((await t.mongoose.model("Transaction").findOne({ user: user._id })).address).toBeUndefined();
	});

	test("refuses while money is in the account or in flight", async () => {
		const withBalance = await t.makeUser({ balance: 10 });
		expect((await withBalance.as(t.api().delete("/api/user")).send({ password: "password123" })).status).toBe(409);

		const withPending = await t.makeUser({ balance: 0 });
		await t.mongoose.model("Transaction").create({ user: withPending.user._id, type: "withdraw", status: "pending", amount: 5, desc: "Withdrawal from account" });
		expect((await withPending.as(t.api().delete("/api/user")).send({ password: "password123" })).status).toBe(409);
	});
});

test("users can view their own transactions only; admins see the owner", async () => {
	const owner = await t.makeUser();
	const other = await t.makeUser();
	const admin = await t.makeUser({ is_admin: true });
	const txn = await t.mongoose.model("Transaction").create({ user: owner.user._id, type: "deposit", status: "completed", amount: 50, desc: "Deposit" });

	const own = await owner.as(t.api().get(`/api/transactions/${txn._id}`));
	expect(own.status).toBe(200);
	expect(own.body.user).toBeUndefined();
	expect((await other.as(t.api().get(`/api/transactions/${txn._id}`))).status).toBe(404);
	const adminView = await admin.as(t.api().get(`/api/transactions/${txn._id}`));
	expect(adminView.body.user.email).toBe(owner.user.email);
	const adminList = await admin.as(t.api().get("/api/transactions/admin"));
	expect(adminList.body.find((x) => x._id === txn._id.toString()).user.email).toBe(owner.user.email);
});

test("state-changing routes no longer accept GET", async () => {
	const { as } = await t.makeUser({ activated: false, balance: 100 });
	expect((await as(t.api().get("/api/user/activate"))).status).toBe(404);
	expect((await as(t.api().get("/api/cart/checkout"))).status).toBe(404);
	expect((await as(t.api().get("/api/auth/logout"))).status).toBe(404);
	expect((await t.api().post("/api/auth/logout")).status).toBe(200);
});

test("non-admins get 403 on admin routes, anonymous users get 401", async () => {
	const { as } = await t.makeUser();
	expect((await as(t.api().get("/api/orders/admin"))).status).toBe(403);
	expect((await t.api().get("/api/orders/admin")).status).toBe(401);
});

test("average ratings keep one decimal place", async () => {
	const admin = await t.makeUser({ is_admin: true });
	const product = await t.mongoose.model("Product").create({ name: "Avg", price: 5, short_desc: "Avg", slugname: "avg", category: "bag" });
	for (const rating of [5, 4]) {
		const { as } = await t.makeUser();
		await as(t.api().post("/api/reviews/avg")).send({ title: "T", comment: "C", rating });
	}
	const pending = await t.mongoose.model("Review").find({ product: product._id });
	for (const review of pending) await admin.as(t.api().put(`/api/reviews/${review._id}`)).send({ status: "accepted" });
	expect((await t.mongoose.model("Product").findById(product._id)).rating.avgRating).toBe(4.5);
});

describe("CORS", () => {
	test("CORS_ORIGINS controls the allowed origins", async () => {
		// Load a fresh copy of the app so it reads CORS_ORIGINS at startup
		let app;
		process.env.CORS_ORIGINS = "https://a.example, https://b.example";
		jest.isolateModules(() => {
			app = require("../src/app");
		});
		delete process.env.CORS_ORIGINS;
		const request = require("supertest");

		const allowed = await request(app).get("/").set("Origin", "https://b.example");
		expect(allowed.headers["access-control-allow-origin"]).toBe("https://b.example");
		const blocked = await request(app).get("/").set("Origin", "https://evil.example");
		expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
	});
});
