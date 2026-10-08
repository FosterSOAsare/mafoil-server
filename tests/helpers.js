// Starts the real Express app against an in-memory MongoDB replica set.
// External services (Stripe, Cloudinary, SMTP) are replaced with jest.mock in each test file.
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const request = require("supertest");
const jwt = require("jsonwebtoken");

async function setupTestApp() {
	const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
	Object.assign(process.env, {
		MONGO_URL: replSet.getUri("mafoil-test"),
		SECRET: "test-secret-that-is-at-least-32-characters",
		STRIPE_KEY: "sk_test_fake",
		NODE_ENV: "test",
		CLIENT_URL: "http://client.test",
		// Rate limits are off by default in tests; tests that check them set this to "false"
		DISABLE_RATE_LIMITS: "true",
	});

	const mongoose = require("mongoose");
	await mongoose.connect(process.env.MONGO_URL);
	const app = require("../src/app");
	// Build the schema indexes (unique constraints are part of what's under test)
	for (const name of mongoose.modelNames()) {
		const model = mongoose.model(name);
		await model.createCollection();
		await model.syncIndexes();
	}

	const User = mongoose.model("User");
	let counter = 0;
	async function makeUser(fields = {}) {
		counter += 1;
		const user = await User.create({ email: `user${counter}@test.com`, password: "password123", fullname: "Test User", verified: true, activated: true, ...fields });
		const token = jwt.sign({ userId: user._id, email: user.email }, process.env.SECRET);
		// Wraps a supertest request with this user's Authorization header
		const as = (req) => req.set("Authorization", `Bearer ${token}`);
		return { user, as, token };
	}

	async function balanceOf(id) {
		const user = await User.findById(id);
		return Math.round(user.balance * 100) / 100;
	}

	async function stop() {
		await mongoose.disconnect();
		await replSet.stop();
	}

	return { app, api: () => request(app), mongoose, makeUser, balanceOf, stop };
}

const okCount = (responses) => responses.filter((response) => response.status === 200).length;
const repeat = (count, fn) => Promise.all(Array.from({ length: count }, fn));

module.exports = { setupTestApp, okCount, repeat };
