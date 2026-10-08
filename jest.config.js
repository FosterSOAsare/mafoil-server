module.exports = {
	testEnvironment: "node",
	testMatch: ["<rootDir>/tests/**/*.test.js"],
	// Each test file starts its own in-memory MongoDB replica set (transactions need a replica set)
	testTimeout: 60000,
};
