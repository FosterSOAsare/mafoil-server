const MongoStore = require("connect-mongo");

const store = MongoStore.create({
	mongoUrl: process.env.MONGO_URL,
	collectionName: "sessions", // Name of the collection to store the sessions in
	ttl: 7 * 24 * 60 * 60, // Time to live (TTL) for the session in seconds (e.g., 7 days)
});

module.exports = store;
