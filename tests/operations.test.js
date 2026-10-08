// Cron jobs, health endpoint, security headers, error handling, contact form, environment checks
jest.mock("stripe", () => require("./mocks").stripe());
jest.mock("nodemailer", () => require("./mocks").nodemailer());

const { setupTestApp } = require("./helpers");
const nodemailer = require("nodemailer");

let t, User, Order, Notification, Transaction;

beforeAll(async () => {
	t = await setupTestApp();
	User = t.mongoose.model("User");
	Order = t.mongoose.model("Order");
	Notification = t.mongoose.model("Notification");
	Transaction = t.mongoose.model("Transaction");
});
afterAll(() => t.stop());

describe("cron jobs", () => {
	const finalizeOrder = require("../src/cron-jobs/finalise-order");
	const deleteUnverifiedUser = require("../src/cron-jobs/delete-unverified-users");
	const deleteReadNotifications = require("../src/cron-jobs/delete-read-notifications");

	test("finished orders pay out price + profit exactly once", async () => {
		const { user } = await t.makeUser({ balance: 0 });
		const due = await Order.create({ user: user._id, cart: [], totalPrice: 100, totalProfit: 6.5, avgProfitPercent: 6.5, status: "pending", endDate: Date.now() - 1000 });
		const notDue = await Order.create({ user: user._id, cart: [], totalPrice: 50, totalProfit: 3, avgProfitPercent: 6, status: "pending", endDate: Date.now() + 86400000 });
		await Promise.all([finalizeOrder(), finalizeOrder(), finalizeOrder()]);

		const completed = await Order.findById(due._id);
		expect(completed.status).toBe("completed");
		expect(completed.completionDate).toBeInstanceOf(Date);
		expect(await t.balanceOf(user._id)).toBe(106.5);
		expect(await Transaction.countDocuments({ user: user._id, desc: "Order finalization" })).toBe(1);
		expect((await Order.findById(notDue._id)).status).toBe("pending");
	});

	test("cleanup removes old unverified users and old read notifications only", async () => {
		const old = await User.create({ email: "old@test.com", password: "password123", fullname: "Old", verified: false });
		await User.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 3 * 3600000) } });
		const fresh = await User.create({ email: "fresh@test.com", password: "password123", fullname: "Fresh", verified: false });
		await deleteUnverifiedUser();
		expect(await User.exists({ _id: old._id })).toBeNull();
		expect(await User.exists({ _id: fresh._id })).not.toBeNull();

		const { user } = await t.makeUser();
		const oldRead = await Notification.create({ user: user._id, link: "/", desc: "old", status: "read" });
		await Notification.collection.updateOne({ _id: oldRead._id }, { $set: { createdAt: new Date(Date.now() - 3 * 86400000) } });
		const newRead = await Notification.create({ user: user._id, link: "/", desc: "new", status: "read" });
		await deleteReadNotifications();
		expect(await Notification.exists({ _id: oldRead._id })).toBeNull();
		expect(await Notification.exists({ _id: newRead._id })).not.toBeNull();
	});
});

describe("app", () => {
	test("health endpoint reports the database connection", async () => {
		const res = await t.api().get("/health");
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ status: "ok", database: "connected" });
	});

	test("helmet security headers are set", async () => {
		const res = await t.api().get("/");
		expect(res.headers["x-content-type-options"]).toBe("nosniff");
		expect(res.headers["x-powered-by"]).toBeUndefined();
	});

	test("validation errors return 400 JSON instead of redirecting", async () => {
		const { as } = await t.makeUser();
		const res = await as(t.api().get("/api/orders/123"));
		expect(res.status).toBe(404);
		const bad = await t.api().post("/api/auth/login").set("Content-Type", "application/json").send("{not json");
		expect(bad.status).toBe(400);
		expect(bad.headers.location).toBeUndefined();
	});

	test("unexpected errors don't leak internal messages", async () => {
		const errors = require("../src/middlewares/error.middleware");
		const res = { statusCode: 200, headersSent: false, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
		jest.spyOn(console, "error").mockImplementation(() => {});
		errors(new Error("connection string mongodb://secret leaked"), {}, res, () => {});
		expect(res.statusCode).toBe(500);
		expect(res.body.error).not.toMatch(/mongodb/);
		console.error.mockRestore();
	});

	test("the auth middleware makes one database query and doesn't set cookies", async () => {
		const { as, user } = await t.makeUser();
		const res = await as(t.api().get("/api/user"));
		expect(res.status).toBe(200);
		expect(res.body.email).toBe(user.email);
		expect(res.headers["set-cookie"]).toBeUndefined();
	});
});

describe("contact form", () => {
	test("validates, escapes HTML and is rate limited", async () => {
		expect((await t.api().post("/api/contact").send({ title: "Hi", email: "nope", message: "Hello" })).status).toBe(400);
		const res = await t.api().post("/api/contact").send({ title: "<b>Hi</b>", email: "a@b.com", message: "<script>alert(1)</script> costs $5 $&" });
		expect(res.status).toBe(200);
		const html = nodemailer.sent.at(-1).html;
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; costs $5 $&amp;");
		expect(html).not.toContain("<script>");

		const statuses = [];
		for (let i = 0; i < 6; i++) statuses.push((await t.api().post("/api/contact").send({ title: "T", email: "a@b.com", message: "M" })).status);
		expect(statuses).toContain(429);
	});
});

describe("environment check", () => {
	const { validateEnv } = require("../src/libs/env");

	test("fails fast when a required variable is missing", () => {
		const saved = process.env.SECRET;
		delete process.env.SECRET;
		expect(() => validateEnv()).toThrow(/SECRET/);
		process.env.SECRET = saved;
		jest.spyOn(console, "warn").mockImplementation(() => {});
		expect(() => validateEnv()).not.toThrow();
		console.warn.mockRestore();
	});
});
