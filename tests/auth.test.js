// Registration, login, email codes, password reset, token revocation and auth rate limits
jest.mock("stripe", () => require("./mocks").stripe());
jest.mock("nodemailer", () => require("./mocks").nodemailer());
// Predictable codes so tests can "read" the emailed code; the real generator is tested separately below
jest.mock("../src/utils/generateCode", () => jest.fn(() => "246810"));

const { setupTestApp } = require("./helpers");
const nodemailer = require("nodemailer");
const generateCode = require("../src/utils/generateCode");

const CODE = "246810";
let t, User;

beforeAll(async () => {
	t = await setupTestApp();
	User = t.mongoose.model("User");
});
afterAll(() => t.stop());

const register = (body) => t.api().post("/api/auth/register").send({ password: "password123", fullname: "Test User", ...body });
const verify = (email, code, mode = "accountverification") => t.api().post("/api/auth/verifyEmail").send({ email, code, mode });

describe("register", () => {
	test("validates email, password and name", async () => {
		const cases = [
			{ email: "not-an-email" },
			{ email: "a@b.com", password: "short" },
			{ email: "a@b.com", password: "x".repeat(73) },
			{ email: "a@b.com", fullname: "" },
			{ email: { $gt: "" } },
		];
		for (const body of cases) {
			expect((await register(body)).status).toBe(400);
		}
	});

	test("creates an inactive, unverified user with a lowercase email and emails an expiring code", async () => {
		const res = await register({ email: "New.User@Test.com", fullname: "  New User  " });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ email: "new.user@test.com" });
		const user = await User.findOne({ email: "new.user@test.com" });
		expect(user).toMatchObject({ activated: false, verified: false, fullname: "New User", codePurpose: "accountverification", codeAttempts: 0 });
		expect(user.codeExpires.getTime()).toBeGreaterThan(Date.now());
		expect(nodemailer.sent.at(-1).to).toBe("new.user@test.com");
	});

	test("an existing email gets the same response, and a verified account gets no email", async () => {
		await t.makeUser({ email: "taken@test.com" });
		const sentBefore = nodemailer.sent.length;
		const res = await register({ email: "Taken@test.com" });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ email: "taken@test.com" });
		expect(nodemailer.sent.length).toBe(sentBefore);
		expect(await User.countDocuments({ email: "taken@test.com" })).toBe(1);
	});

	test("ignores a malformed referrer", async () => {
		expect((await register({ email: "ref@test.com", referrer: { $ne: null } })).status).toBe(200);
		expect((await User.findOne({ email: "ref@test.com" })).referrer).toBeUndefined();
	});
});

describe("login", () => {
	test("unknown email and wrong password give the same error", async () => {
		await t.makeUser({ email: "known@test.com" });
		const unknown = await t.api().post("/api/auth/login").send({ email: "nobody@test.com", password: "password123" });
		const wrong = await t.api().post("/api/auth/login").send({ email: "known@test.com", password: "wrongpassword" });
		expect(unknown.status).toBe(400);
		expect(unknown.body.error).toBe(wrong.body.error);
	});

	test("missing or non-string fields return 400", async () => {
		expect((await t.api().post("/api/auth/login").send({})).status).toBe(400);
		expect((await t.api().post("/api/auth/login").send({ email: { $ne: null }, password: { $ne: null } })).status).toBe(400);
	});

	test("valid credentials return a token", async () => {
		await t.makeUser({ email: "good@test.com" });
		const res = await t.api().post("/api/auth/login").send({ email: "GOOD@test.com", password: "password123" });
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ email: "good@test.com", subscribed: false });
		expect(res.body.token).toBeTruthy();
	});
});

describe("email verification codes", () => {
	test("a correct code verifies the account and can't be reused", async () => {
		await register({ email: "verify@test.com" });
		expect((await verify("verify@test.com", CODE)).status).toBe(200);
		expect((await User.findOne({ email: "verify@test.com" })).verified).toBe(true);
		expect((await verify("verify@test.com", CODE)).status).toBe(400);
	});

	test("allows only 5 guesses per code", async () => {
		await register({ email: "guess@test.com" });
		for (let i = 0; i < 5; i++) expect((await verify("guess@test.com", "000000")).status).toBe(400);
		// Even the right code is refused once the guesses are used up
		expect((await verify("guess@test.com", CODE)).status).toBe(400);
		expect((await User.findOne({ email: "guess@test.com" })).verified).toBe(false);
	});

	test("concurrent guesses can't exceed the limit", async () => {
		await register({ email: "burst@test.com" });
		await Promise.all(Array.from({ length: 20 }, () => verify("burst@test.com", "000000")));
		expect((await User.findOne({ email: "burst@test.com" })).codeAttempts).toBe(5);
	});

	test("expired codes are refused", async () => {
		await register({ email: "expired@test.com" });
		await User.updateOne({ email: "expired@test.com" }, { $set: { codeExpires: new Date(Date.now() - 1000) } });
		expect((await verify("expired@test.com", CODE)).status).toBe(400);
	});

	test("a verification code can't be used as a reset code", async () => {
		await register({ email: "purpose@test.com" });
		expect((await verify("purpose@test.com", CODE, "resetpassword")).status).toBe(400);
	});

	test("unknown emails and wrong codes give the same error", async () => {
		await register({ email: "same@test.com" });
		const unknown = await verify("nobody@test.com", "123456");
		const wrong = await verify("same@test.com", "000000");
		expect(unknown.status).toBe(400);
		expect(unknown.body.error).toBe(wrong.body.error);
	});
});

describe("password reset", () => {
	test("full flow: code -> single-use token -> new password, old sessions revoked", async () => {
		const { as } = await t.makeUser({ email: "reset@test.com" });
		expect((await as(t.api().get("/api/user"))).status).toBe(200);

		expect((await t.api().post("/api/auth/resetPassword").send({ email: "reset@test.com" })).status).toBe(200);
		const verified = await verify("reset@test.com", CODE, "resetpassword");
		expect(verified.status).toBe(200);
		const { token } = verified.body;
		expect(token).toMatch(/^[a-f0-9]{64}$/);
		// Only the token's hash is stored, never the token or the code hash in a response
		expect((await User.findOne({ email: "reset@test.com" })).resetTokenHash).not.toBe(token);

		expect((await t.api().post("/api/auth/confirmReset").send({ email: "reset@test.com", token: "f".repeat(64), newPassword: "newpassword1" })).status).toBe(400);
		expect((await t.api().post("/api/auth/confirmReset").send({ email: "reset@test.com", token, newPassword: "newpassword1" })).status).toBe(200);
		// Single use
		expect((await t.api().post("/api/auth/confirmReset").send({ email: "reset@test.com", token, newPassword: "another123" })).status).toBe(400);

		expect((await t.api().post("/api/auth/login").send({ email: "reset@test.com", password: "newpassword1" })).status).toBe(200);
		// The session from before the reset no longer works
		expect((await as(t.api().get("/api/user"))).status).toBe(401);
	});

	test("expired reset tokens are refused", async () => {
		await t.makeUser({ email: "late@test.com" });
		await t.api().post("/api/auth/resetPassword").send({ email: "late@test.com" });
		const { token } = (await verify("late@test.com", CODE, "resetpassword")).body;
		await User.updateOne({ email: "late@test.com" }, { $set: { resetTokenExpires: new Date(Date.now() - 1000) } });
		expect((await t.api().post("/api/auth/confirmReset").send({ email: "late@test.com", token, newPassword: "newpassword1" })).status).toBe(400);
	});

	test("reset and resend give the same response for unknown, unverified and verified emails", async () => {
		await t.makeUser({ email: "verified@test.com" });
		await t.makeUser({ email: "unverified@test.com", verified: false });
		const sentBefore = nodemailer.sent.length;
		for (const email of ["missing@test.com", "unverified@test.com", "verified@test.com"]) {
			const res = await t.api().post("/api/auth/resetPassword").send({ email });
			expect(res.status).toBe(200);
			expect(res.body).toEqual({ success: true });
		}
		expect(nodemailer.sent.length - sentBefore).toBe(1);
		expect((await t.api().post("/api/auth/resendEmail").send({ email: "ghost@test.com", mode: "accountverification" })).status).toBe(200);
	});
});

describe("sessions", () => {
	test("changing the password revokes old tokens and returns a new one", async () => {
		const { as } = await t.makeUser();
		const res = await as(t.api().put("/api/user/password")).send({ oldpassword: "password123", newpassword: "brandnew123" });
		expect(res.status).toBe(200);
		expect((await as(t.api().get("/api/user"))).status).toBe(401);
		expect((await t.api().get("/api/user").set("Authorization", `Bearer ${res.body.token}`)).status).toBe(200);
	});

	test("logout revokes the token", async () => {
		const { as } = await t.makeUser();
		expect((await as(t.api().post("/api/auth/logout"))).status).toBe(200);
		expect((await as(t.api().get("/api/user"))).status).toBe(401);
	});

	test("the unauthenticated changePassword endpoint is gone", async () => {
		expect((await t.api().post("/api/auth/changePassword").send({ email: "a@b.com", password: "x", newPassword: "y" })).status).toBe(404);
	});
});

describe("rate limits", () => {
	beforeAll(() => {
		process.env.DISABLE_RATE_LIMITS = "false";
	});
	afterAll(() => {
		process.env.DISABLE_RATE_LIMITS = "true";
	});

	test("login is limited per account", async () => {
		await t.makeUser({ email: "target@test.com" });
		const statuses = [];
		for (let i = 0; i < 11; i++) statuses.push((await t.api().post("/api/auth/login").send({ email: "target@test.com", password: "wrong-password" })).status);
		expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
		expect(statuses[10]).toBe(429);
	});

	test("reset emails are limited per account", async () => {
		const statuses = [];
		for (let i = 0; i < 6; i++) statuses.push((await t.api().post("/api/auth/resetPassword").send({ email: "bomb@test.com" })).status);
		expect(statuses[5]).toBe(429);
	});
});

test("verification codes are never logged", async () => {
	const log = jest.spyOn(console, "log").mockImplementation(() => {});
	await register({ email: "quiet@test.com" });
	expect(log.mock.calls.flat().join(" ")).not.toContain(CODE);
	log.mockRestore();
});

test("the real code generator produces random 6-digit codes", () => {
	const realGenerate = jest.requireActual("../src/utils/generateCode");
	const codes = new Set(Array.from({ length: 50 }, () => realGenerate()));
	for (const code of codes) expect(code).toMatch(/^\d{6}$/);
	expect(codes.size).toBeGreaterThan(40);
	expect(generateCode).toHaveBeenCalled();
});
