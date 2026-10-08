// Checks environment variables at startup so a misconfigured deploy fails immediately with a clear message
const REQUIRED = ["MONGO_URL", "SECRET"];
// The server can start without these, but the related features won't work
const FEATURE_VARIABLES = {
	CLIENT_URL: "Stripe redirects after a deposit",
	STRIPE_KEY: "deposits",
	CLOUDINARY_CLOUD_NAME: "image uploads",
	CLOUDINARY_API_KEY: "image uploads",
	CLOUDINARY_API_SECRET: "image uploads",
	SMTP_HOST: "emails",
	EMAIL_ADDRESS: "emails",
	EMAIL_PASSWORD: "emails",
	SUPPORT_EMAIL: "the contact form",
};

// Old lowercase names that are still accepted
const LEGACY_NAMES = {
	STRIPE_KEY: "stripe_key",
	CLOUDINARY_CLOUD_NAME: "cloudinary_cloud_name",
	CLOUDINARY_API_KEY: "cloudinary_api_key",
	CLOUDINARY_API_SECRET: "cloudinary_api_secret",
};

function validateEnv() {
	const missing = REQUIRED.filter((name) => !process.env[name]);
	if (missing.length) {
		throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
	}
	if (process.env.SECRET.length < 32) {
		console.warn("Warning: SECRET is shorter than 32 characters. Use a long random value.");
	}
	for (const [name, feature] of Object.entries(FEATURE_VARIABLES)) {
		const legacyName = LEGACY_NAMES[name];
		if (!process.env[name] && legacyName && process.env[legacyName]) {
			console.warn(`Warning: ${legacyName} is deprecated, rename it to ${name}.`);
		} else if (!process.env[name]) {
			console.warn(`Warning: ${name} is not set, so ${feature} won't work.`);
		}
	}
}

module.exports = { validateEnv };
