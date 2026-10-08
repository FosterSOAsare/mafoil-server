// Products, search, reviews and wishlist
jest.mock("stripe", () => require("./mocks").stripe());
jest.mock("nodemailer", () => require("./mocks").nodemailer());
jest.mock("cloudinary", () => require("./mocks").cloudinary());

const { setupTestApp, okCount, repeat } = require("./helpers");
const cloudinary = require("cloudinary");

let t, Product, Review, admin, shopper;

const validProduct = (fields = {}) => ({
	name: "Short Sleeve Sweater",
	price: 49.99,
	category: "cloth",
	store: "Zoho Store",
	short_desc: "A light sweater for warm days",
	long_desc: "",
	images: [{ url: "https://res.cloudinary.com/test/a.png", public_id: "mafoil/a" }],
	...fields,
});

beforeAll(async () => {
	t = await setupTestApp();
	Product = t.mongoose.model("Product");
	Review = t.mongoose.model("Review");
	admin = await t.makeUser({ is_admin: true });
	shopper = await t.makeUser();
});
afterAll(() => t.stop());

describe("listing and search", () => {
	beforeAll(async () => {
		const docs = Array.from({ length: 15 }, (_, i) => ({ name: `Item ${i}`, price: 10 + i, short_desc: "Item", slugname: `item-${i}`, category: i % 2 ? "bag" : "shoe" }));
		await Product.insertMany(docs);
	});

	test("paginates with a correct nextPage and caps the page size", async () => {
		const first = await t.api().get("/api/products?page=1&size=10");
		expect(first.body.data).toHaveLength(10);
		expect(first.body.nextPage).toBe(true);
		const second = await t.api().get("/api/products?page=2&size=10");
		expect(second.body.nextPage).toBe(false);
		const huge = await t.api().get("/api/products?size=100000");
		expect(huge.body.data.length).toBeLessThanOrEqual(100);
		expect((await t.api().get("/api/products?page=-3&size=abc")).status).toBe(200);
	});

	test("operator objects in the query are ignored", async () => {
		const res = await t.api().get("/api/products?category[$ne]=shoe&size=100");
		expect(res.status).toBe(200);
		// The operator was stripped, so this behaves like an unfiltered list
		expect(res.body.data.some((p) => p.category === "shoe")).toBe(true);
	});

	test("search matches literally and survives regex patterns", async () => {
		const start = Date.now();
		const res = await t.api().get(`/api/products/search?searchText=${encodeURIComponent("(a+)+$")}`);
		expect(res.status).toBe(200);
		expect(res.body).toEqual([]);
		expect(Date.now() - start).toBeLessThan(2000);
		expect((await t.api().get("/api/products/search?searchText=item%201")).body.length).toBeGreaterThan(0);
		expect((await t.api().get("/api/products/search?searchText[]=a")).status).toBe(400);
	});

	test("category counts", async () => {
		const res = await t.api().get("/api/products/categories");
		expect(res.body).toMatchObject({ shoe: 8, bag: 7 });
		expect(res.body.all).toBeGreaterThanOrEqual(15);
	});

	test("recents only accepts a short list of slugs", async () => {
		expect((await t.api().post("/api/products/recents").send({ recents: { $ne: null } })).status).toBe(400);
		expect((await t.api().post("/api/products/recents").send({ recents: Array(21).fill("x") })).status).toBe(400);
		expect((await t.api().post("/api/products/recents").send({ recents: ["item-1", "item-2"] })).body).toHaveLength(2);
	});
});

describe("admin product management", () => {
	test("validates product input", async () => {
		for (const body of [validProduct({ price: -1 }), validProduct({ price: "49" }), validProduct({ category: "Shirt" }), validProduct({ images: [] }), validProduct({ images: [{ url: "https://evil.com/a.png", public_id: "x" }] })]) {
			expect((await admin.as(t.api().post("/api/products")).send(body)).status).toBe(400);
		}
		expect((await shopper.as(t.api().post("/api/products")).send(validProduct())).status).toBe(403);
		expect((await shopper.as(t.api().get("/api/products/edit/item-1"))).status).toBe(403);
	});

	test("creates URL-safe slugs and rejects duplicates", async () => {
		const res = await admin.as(t.api().post("/api/products")).send(validProduct({ name: "Café / Bag? #1 100%" }));
		expect(res.status).toBe(200);
		expect(res.body.slugname).toBe("cafe-bag-1-100");
		expect((await admin.as(t.api().post("/api/products")).send(validProduct({ name: "Café / Bag? #1 100%" }))).status).toBe(400);
		expect((await admin.as(t.api().post("/api/products")).send(validProduct({ name: "Search" }))).body.slugname).toBe("search-item");
	});

	test("delete removes the product, its images and cart/wishlist entries", async () => {
		const product = await Product.create({ name: "To Delete", price: 5, short_desc: "Bye", slugname: "to-delete", category: "bag", images: [{ url: "https://res.cloudinary.com/x.png", public_id: "mafoil/to-delete" }] });
		await t.mongoose.model("WishList").create({ user: shopper.user._id, wishlist: [product._id] });
		expect((await shopper.as(t.api().delete(`/api/products/${product._id}`))).status).toBe(403);
		expect((await admin.as(t.api().delete(`/api/products/${product._id}`))).status).toBe(200);
		expect(await Product.exists({ _id: product._id })).toBeNull();
		expect(cloudinary.calls).toContainEqual(["destroy", "mafoil/to-delete"]);
		expect((await t.mongoose.model("WishList").findOne({ user: shopper.user._id })).wishlist).toHaveLength(0);
		expect((await admin.as(t.api().delete(`/api/products/${product._id}`))).status).toBe(404);
	});
});

describe("reviews", () => {
	let product;
	beforeAll(async () => {
		product = await Product.create({ name: "Reviewed", price: 20, short_desc: "Reviewed item", slugname: "reviewed", category: "bag" });
	});

	test("rating must be a whole number from 1 to 5", async () => {
		for (const rating of [0, -3, 6, 4.5, "5"]) {
			expect((await shopper.as(t.api().post("/api/reviews/reviewed")).send({ title: "Great", comment: "Really nice", rating })).status).toBe(400);
		}
	});

	test("one review per user, moderated once, emails never public", async () => {
		const { as } = await t.makeUser();
		expect((await as(t.api().post("/api/reviews/reviewed")).send({ title: "Great", comment: "Really nice", rating: 5 })).status).toBe(200);
		expect((await as(t.api().post("/api/reviews/reviewed")).send({ title: "Again", comment: "Second one", rating: 1 })).status).toBe(409);

		const review = await Review.findOne({ product: product._id });
		const decisions = await repeat(3, () => admin.as(t.api().put(`/api/reviews/${review._id}`)).send({ status: "accepted" }));
		expect(okCount(decisions)).toBe(1);
		expect((await Product.findById(product._id)).rating).toMatchObject({ totalRatings: 1, accumulatedRating: 5, avgRating: 5 });
		expect((await admin.as(t.api().put(`/api/reviews/${review._id}`)).send({ status: "rejected" })).status).toBe(409);

		const listing = await t.api().get("/api/reviews/reviewed");
		expect(listing.body).toHaveLength(1);
		expect(listing.body[0].email).toBeUndefined();
		expect(listing.body[0].user).toBeUndefined();
	});
});

describe("wishlist", () => {
	test("validates ids, removes duplicates and returns real ratings without deleted products", async () => {
		const { as } = await t.makeUser();
		const rated = await Product.create({ name: "Rated", price: 9, short_desc: "Rated", slugname: "rated", category: "bag", rating: { totalRatings: 2, avgRating: 4, accumulatedRating: 8 } });
		const ghostId = new t.mongoose.Types.ObjectId().toString();

		expect((await as(t.api().post("/api/wishlist")).send({ wishlist: ["not-an-id"] })).status).toBe(400);
		expect((await as(t.api().post("/api/wishlist")).send({ wishlist: [rated._id.toString(), rated._id.toString(), ghostId] })).status).toBe(200);

		const res = await as(t.api().get("/api/wishlist"));
		expect(res.body).toHaveLength(1);
		expect(res.body[0].rating).toMatchObject({ avgRating: 4, totalRatings: 2 });
	});
});
