// Wallet: withdrawals, cart checkout, cancellations, activation, deposits and admin withdrawal decisions
jest.mock("stripe", () => require("./mocks").stripe());
jest.mock("nodemailer", () => require("./mocks").nodemailer());

const { setupTestApp, okCount, repeat } = require("./helpers");
const stripe = require("stripe");

let t, Product, Cart, Order, Transaction;

beforeAll(async () => {
	t = await setupTestApp();
	({ Product, Cart, Order, Transaction } = {
		Product: t.mongoose.model("Product"),
		Cart: t.mongoose.model("Cart"),
		Order: t.mongoose.model("Order"),
		Transaction: t.mongoose.model("Transaction"),
	});
});
afterAll(() => t.stop());

const createProduct = (fields = {}) =>
	Product.create({ name: "Bag", price: 30, short_desc: "A small bag", slugname: `bag-${Math.random().toString(36).slice(2)}`, category: "bag", ...fields });

describe("withdraw", () => {
	test("rejects negative, zero, non-number and over-balance amounts", async () => {
		const { user, as } = await t.makeUser({ balance: 100 });
		for (const amount of [-1000, 0, "50", 500]) {
			const res = await as(t.api().post("/api/user/withdraw")).send({ amount, address: "wallet-1" });
			expect(res.status).toBe(400);
		}
		expect(await t.balanceOf(user._id)).toBe(100);
	});

	test("concurrent withdrawals cannot overdraw", async () => {
		const { user, as } = await t.makeUser({ balance: 100, activated: false });
		const responses = await repeat(5, () => as(t.api().post("/api/user/withdraw")).send({ amount: 60, address: "wallet-1" }));
		expect(okCount(responses)).toBe(1);
		expect(await t.balanceOf(user._id)).toBe(40);
		const txn = await Transaction.findOne({ user: user._id, type: "withdraw" });
		expect(txn.status).toBe("pending");
		expect((await t.mongoose.model("User").findById(user._id)).activated).toBe(false);
	});
});

describe("admin withdrawal decisions", () => {
	test("approve completes, reject refunds, each only once", async () => {
		const { user, as } = await t.makeUser({ balance: 100 });
		const { as: asAdmin } = await t.makeUser({ is_admin: true });
		await as(t.api().post("/api/user/withdraw")).send({ amount: 30, address: "wallet-1" });
		const txn = await Transaction.findOne({ user: user._id, status: "pending" });

		expect((await as(t.api().put(`/api/transactions/${txn._id}/approve`))).status).toBe(403);

		const decisions = await Promise.all([asAdmin(t.api().put(`/api/transactions/${txn._id}/approve`)), asAdmin(t.api().put(`/api/transactions/${txn._id}/reject`))]);
		expect(okCount(decisions)).toBe(1);
		const status = (await Transaction.findById(txn._id)).status;
		expect(await t.balanceOf(user._id)).toBe(status === "completed" ? 70 : 100);
		expect((await asAdmin(t.api().put(`/api/transactions/${txn._id}/approve`))).status).toBe(409);
	});
});

describe("cart and checkout", () => {
	test("rejects invalid cart items", async () => {
		const product = await createProduct();
		const { as } = await t.makeUser();
		const badCarts = [[{ id: product._id, count: -5 }], [{ id: product._id, count: 0 }], [{ id: product._id, count: 1.5 }], [{ id: product._id, count: 100 }], [{ id: "not-an-id", count: 1 }], [{ id: { $ne: null }, count: 1 }]];
		for (const cart of badCarts) {
			expect((await as(t.api().post("/api/cart")).send({ cart })).status).toBe(400);
		}
	});

	test("insufficient balance keeps the cart and creates no order", async () => {
		const product = await createProduct();
		const { user, as } = await t.makeUser({ balance: 100 });
		await as(t.api().post("/api/cart")).send({ cart: [{ id: product._id.toString(), count: 5 }] });
		expect((await as(t.api().post("/api/cart/checkout"))).status).toBe(400);
		expect(await Cart.countDocuments({ user: user._id })).toBe(1);
		expect(await Order.countDocuments({ user: user._id })).toBe(0);
	});

	test("concurrent checkouts charge once, and the order can be cancelled once", async () => {
		const product = await createProduct();
		const { user, as } = await t.makeUser({ balance: 100 });
		await as(t.api().post("/api/cart")).send({ cart: [{ id: product._id.toString(), count: 1 }] });
		const checkouts = await repeat(3, () => as(t.api().post("/api/cart/checkout")));
		expect(okCount(checkouts)).toBe(1);
		expect(await t.balanceOf(user._id)).toBe(70);

		const order = await Order.findOne({ user: user._id });
		const cancels = await repeat(3, () => as(t.api().post(`/api/orders/cancel/${order._id}`)));
		expect(okCount(cancels)).toBe(1);
		expect(await t.balanceOf(user._id)).toBe(100);
	});

	test("inactive users cannot check out", async () => {
		const { as } = await t.makeUser({ activated: false, balance: 500 });
		const res = await as(t.api().post("/api/cart/checkout"));
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/activated/i);
	});
});

describe("activation", () => {
	test("charges the fee once and pays the referrer once", async () => {
		const { user: referrer } = await t.makeUser({ balance: 0 });
		const { user, as } = await t.makeUser({ balance: 100, activated: false, referrer: referrer._id });
		const responses = await repeat(3, () => as(t.api().post("/api/user/activate")));
		expect(okCount(responses)).toBe(1);
		expect(await t.balanceOf(user._id)).toBe(60);
		expect(await t.balanceOf(referrer._id)).toBe(3);
	});
});

describe("deposits", () => {
	test("validates the amount and ties the session to the user", async () => {
		const { user, as } = await t.makeUser({ balance: 0 });
		for (const amount of [-5, 0, 0.5, 10001, 10.123, "10"]) {
			expect((await as(t.api().post("/api/user/deposit-checkout")).send({ amount })).status).toBe(400);
		}
		expect(stripe.created).toHaveLength(0);
		expect((await as(t.api().post("/api/user/deposit-checkout")).send({ amount: 19.99 })).status).toBe(200);
		expect(stripe.created[0].client_reference_id).toBe(user._id.toString());
		expect(stripe.created[0].line_items[0].price_data.unit_amount).toBe(1999);
	});

	test("a paid session is credited once, and only to its owner", async () => {
		const { user, as } = await t.makeUser({ balance: 0 });
		const { as: asOther } = await t.makeUser({ balance: 0 });
		stripe.sessions.cs_paid = { payment_status: "paid", amount_total: 1000, client_reference_id: user._id.toString() };
		stripe.sessions.cs_unpaid = { payment_status: "unpaid", amount_total: 1000, client_reference_id: user._id.toString() };

		expect((await as(t.api().put("/api/user/validate-checkout")).send({ sessionId: "cs_unpaid" })).status).toBe(400);
		expect((await asOther(t.api().put("/api/user/validate-checkout")).send({ sessionId: "cs_paid" })).status).toBe(403);
		const claims = await repeat(3, () => as(t.api().put("/api/user/validate-checkout")).send({ sessionId: "cs_paid" }));
		expect(okCount(claims)).toBe(1);
		expect(await t.balanceOf(user._id)).toBe(127.8);
		expect((await as(t.api().put("/api/user/validate-checkout")).send({ sessionId: "cs_paid" })).status).toBe(409);
	});
});
