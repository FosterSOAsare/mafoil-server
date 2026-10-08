// Registration, login, verification and password reset
jest.mock("stripe", () => require("./mocks").stripe());
jest.mock("nodemailer", () => require("./mocks").nodemailer());

const { setupTestApp } = require("./helpers");
const nodemailer = require("nodemailer");

let t, User;

beforeAll(async () => {
	t = await setupTestApp();
	User = t.mongoose.model("User");
});
afterAll(() => t.stop());

describe("register", () => {
	test("validates email, password and name", async () => {
		const cases = [
			{ email: "not-an-email", password: "password123", fullname: "Test User" },
			{ email: "a@b.com", password: "short", fullname: "Test User" },
			{ email: "a@b.com", password: "x".repeat(73), fullname: "Test User" },
			{ email: "a@b.com", password: "password123", fullname: "" },
			{ email: { $gt: "" }, password: "password123", fullname: "Test User" },
		];
		for (const body of cases) {
			expect((await t.api().post("/api/auth/register").send(body)).status).toBe(400);
		}
	});

	test("creates an inactive, unverified user with a lowercase email and emails a code", async () => {
		const res = await t.api().post("/api/auth/register").send({ email: "New.User@Test.com", password: "password123", fullname: "  New User  " });
		expect(res.status).toBe(200);
		const user = await User.findOne({ email: "new.user@test.com" });
		expect(user).toMatchObject({ activated: false, verified: false, fullname: "New User" });
		expect(user.code).toBeTruthy();
		expect(nodemailer.sent.at(-1).to).toBe("new.user@test.com");
	});

	test("ignores a malformed referrer", async () => {
		const res = await t.api().post("/api/auth/register").send({ email: "ref@test.com", password: "password123", fullname: "Ref User", referrer: { $ne: null } });
		expect(res.status).toBe(200);
		expect((await User.findOne({ email: "ref@test.com" })).referrer).toBeUndefined();
	});

	test("the unique index stops duplicate emails", async () => {
		await User.create({ email: "dup@test.com", password: "password123", fullname: "One" });
		await expect(User.create({ email: "DUP@test.com", password: "password123", fullname: "Two" })).rejects.toThrow(/duplicate key/);
	});
});

describe("login", () => {
	test("unknown email and wrong password give the same error", async () => {
		await t.makeUser({ email: "known@test.com" });
		const unknown = await t.api().post("/api/auth/login").send({ email: "nobody@test.com", password: "password123" });
		const wrong = await t.api().post("/api/auth/login").send({ email: "known@test.com", password: "wrongpassword" });
		expect(unknown.status).toBe(400);
		expect(wrong.status).toBe(400);
		expect(unknown.body.error).toBe(wrong.body.error);
	});

	test("missing or non-string fields return 400, not 500", async () => {
		expect((await t.api().post("/api/auth/login").send({})).status).toBe(400);
		expect((await t.api().post("/api/auth/login").send({ email: { $ne: null }, password: { $ne: null } })).status).toBe(400);
	});

	test("valid credentials return a token and the subscription status", async () => {
		await t.makeUser({ email: "good@test.com" });
		const res = await t.api().post("/api/auth/login").send({ email: "GOOD@test.com", password: "password123" });
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ email: "good@test.com", subscribed: false });
		expect(res.body.token).toBeTruthy();
	});
});

describe("verification and reset emails don't reveal which accounts exist", () => {
	test("reset password returns the same response for unknown, unverified and verified emails", async () => {
		await t.makeUser({ email: "verified@test.com" });
		await t.makeUser({ email: "unverified@test.com", verified: false });
		const sentBefore = nodemailer.sent.length;
		for (const email of ["missing@test.com", "unverified@test.com", "verified@test.com"]) {
			const res = await t.api().post("/api/auth/resetPassword").send({ email });
			expect(res.status).toBe(200);
			expect(res.body).toEqual({ success: true });
		}
		// Only the verified account actually gets an email
		expect(nodemailer.sent.length - sentBefore).toBe(1);
		expect(nodemailer.sent.at(-1).to).toBe("verified@test.com");
	});

	test("resend returns success for unknown emails", async () => {
		const res = await t.api().post("/api/auth/resendEmail").send({ email: "ghost@test.com", mode: "accountverification" });
		expect(res.status).toBe(200);
	});

	test("verifyEmail gives the same error for an unknown email and a wrong code", async () => {
		await t.makeUser({ email: "pending@test.com", verified: false });
		const unknown = await t.api().post("/api/auth/verifyEmail").send({ email: "nobody@test.com", code: "123456", mode: "accountverification" });
		const wrong = await t.api().post("/api/auth/verifyEmail").send({ email: "pending@test.com", code: "000000", mode: "accountverification" });
		expect(unknown.status).toBe(400);
		expect(unknown.body.error).toBe(wrong.body.error);
	});
});

test("verification codes are never logged", async () => {
	const log = jest.spyOn(console, "log").mockImplementation(() => {});
	await t.api().post("/api/auth/register").send({ email: "quiet@test.com", password: "password123", fullname: "Quiet User" });
	expect(log.mock.calls.flat().join(" ")).not.toMatch(/code is/);
	log.mockRestore();
});
