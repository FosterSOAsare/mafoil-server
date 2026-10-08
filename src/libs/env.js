// Checks environment variables at startup so a misconfigured deploy fails immediately with a clear message
const REQUIRED = ["MONGO_URL", "SECRET"];
// The server can start without these, but the related features won't work
const FEATURE_VARIABLES = {
	CLIENT_URL: "Stripe redirects after a deposit",
	stripe_key: "deposits",
	cloudinary_cloud_name: "image uploads",
	cloudinary_api_key: "image uploads",
	cloudinary_api_secret: "image uploads",
	SMTP_HOST: "emails",
	EMAIL_ADDRESS: "emails",
	EMAIL_PASSWORD: "emails",
	SUPPORT_EMAIL: "the contact form",
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
		if (!process.env[name]) console.warn(`Warning: ${name} is not set, so ${feature} won't work.`);
	}
}

module.exports = { validateEnv };
