// Access control: orders, notifications, newsletter, file uploads, admin-only routes
jest.mock("stripe", () => require("./mocks").stripe());
jest.mock("nodemailer", () => require("./mocks").nodemailer());
jest.mock("cloudinary", () => require("./mocks").cloudinary());

const { setupTestApp } = require("./helpers");
const cloudinary = require("cloudinary");

let t, alice, bob, admin;

beforeAll(async () => {
	t = await setupTestApp();
	alice = await t.makeUser();
	bob = await t.makeUser();
	admin = await t.makeUser({ is_admin: true });
});
afterAll(() => t.stop());

test("orders are only visible to their owner and admins", async () => {
	const Order = t.mongoose.model("Order");
	const order = await Order.create({
		user: alice.user._id,
		cart: [{ itemId: new t.mongoose.Types.ObjectId(), count: 1, price: 10, profitPercent: 5, totalItemsProfit: 0.5 }],
		totalPrice: 10,
		totalProfit: 0.5,
		avgProfitPercent: 5,
		status: "pending",
		endDate: Date.now() + 86400000,
	});
	const own = await alice.as(t.api().get(`/api/orders/${order._id}`));
	expect(own.status).toBe(200);
	expect(own.body.cart[0].name).toBe("Product no longer available");
	expect((await bob.as(t.api().get(`/api/orders/${order._id}`))).status).toBe(404);
	expect((await admin.as(t.api().get(`/api/orders/${order._id}`))).status).toBe(200);
	expect((await bob.as(t.api().get("/api/orders/not-an-id"))).status).toBe(404);
});

test("notifications can only be read and marked by their owner", async () => {
	const Notification = t.mongoose.model("Notification");
	const note = await Notification.create({ user: alice.user._id, link: "/account", desc: "Private message" });
	const res = await bob.as(t.api().put(`/api/notifications/${note._id}/read`));
	expect(res.status).toBe(404);
	expect(JSON.stringify(res.body)).not.toContain("Private");
	expect((await Notification.findById(note._id)).status).toBe("unread");
	expect((await alice.as(t.api().put(`/api/notifications/${note._id}/read`))).status).toBe(200);
});

test("newsletter: admin-only list, own-email unsubscribe, validated email", async () => {
	const Newsletter = t.mongoose.model("Newsletter");
	await Newsletter.create({ email: "victim@example.com" });
	expect((await bob.as(t.api().get("/api/newsletters/all"))).status).toBe(401);
	expect((await admin.as(t.api().get("/api/newsletters/all"))).status).toBe(200);
	expect((await bob.as(t.api().post("/api/newsletters")).send({ email: "victim@example.com", moderation: "unsub" })).status).toBe(403);
	expect((await bob.as(t.api().post("/api/newsletters")).send({ email: { $ne: null }, moderation: "unsub" })).status).toBe(400);
	expect((await Newsletter.findOne({ email: "victim@example.com" })).status).toBe("active");
	expect((await alice.as(t.api().post("/api/newsletters")).send({ email: alice.user.email.toUpperCase(), moderation: "unsub" })).status).toBe(200);
	expect((await Newsletter.findOne({ email: alice.user.email })).status).toBe("inactive");
});

test("newsletter preference endpoint updates the subscription", async () => {
	const { user, as } = await t.makeUser();
	expect((await as(t.api().put("/api/user/newsletter")).send({ subscription: true })).status).toBe(200);
	expect((await as(t.api().get("/api/user"))).body.subscribed).toBe(true);
	await as(t.api().put("/api/user/newsletter")).send({ subscription: false });
	expect((await as(t.api().get("/api/user"))).body.subscribed).toBe(false);
	expect(user.email).toBeTruthy();
});

describe("file uploads", () => {
	const png = Buffer.from("89504e470d0a1a0a", "hex");

	test("only admins can upload images, with type and size limits", async () => {
		expect((await t.api().post("/api/files").attach("file", png, { filename: "a.png", contentType: "image/png" })).status).toBe(401);
		expect((await bob.as(t.api().post("/api/files")).attach("file", png, { filename: "a.png", contentType: "image/png" })).status).toBe(401);
		expect((await admin.as(t.api().post("/api/files")).attach("file", Buffer.from("<html>"), { filename: "x.html", contentType: "text/html" })).status).toBe(400);
		expect((await admin.as(t.api().post("/api/files")).attach("file", Buffer.alloc(6 * 1024 * 1024), { filename: "big.png", contentType: "image/png" })).status).toBe(400);
		expect((await admin.as(t.api().post("/api/files"))).status).toBe(400);
		expect(cloudinary.calls.filter(([type]) => type === "upload")).toHaveLength(0);

		const res = await admin.as(t.api().post("/api/files")).attach("file", png, { filename: "evil.html", contentType: "image/png" });
		expect(res.status).toBe(200);
		expect(cloudinary.calls.at(-1)[1]).toMatchObject({ folder: "mafoil", format: "png" });
	});

	test("only admins can delete, and only inside mafoil/", async () => {
		expect((await bob.as(t.api().delete("/api/files?public_id=mafoil/abc"))).status).toBe(401);
		expect((await admin.as(t.api().delete("/api/files?public_id=other/logo"))).status).toBe(403);
		expect((await admin.as(t.api().delete("/api/files?public_id=mafoil/abc"))).status).toBe(200);
		expect(cloudinary.calls).toContainEqual(["destroy", "mafoil/abc"]);
	});
});
