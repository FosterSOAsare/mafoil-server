// Factories for jest.mock: fake Stripe, Cloudinary and nodemailer that record what they were asked to do.
// Usage in a test file (jest.mock is hoisted, so the factory has to require this file):
//   jest.mock("stripe", () => require("./mocks").stripe());

function stripe() {
	const sessions = {};
	const created = [];
	const factory = () => ({
		checkout: {
			sessions: {
				retrieve: async (id) => sessions[id],
				create: async (args) => {
					created.push(args);
					return { id: `cs_${created.length}`, url: "https://stripe.test/checkout" };
				},
			},
		},
	});
	factory.sessions = sessions;
	factory.created = created;
	return factory;
}

function cloudinary() {
	const calls = [];
	return {
		calls,
		v2: {
			config() {},
			uploader: {
				upload: async (data, options) => {
					calls.push(["upload", options]);
					return { public_id: `${options.folder}/uploaded`, secure_url: "https://res.cloudinary.com/test/uploaded.png" };
				},
				destroy: async (publicId) => {
					calls.push(["destroy", publicId]);
					return {};
				},
			},
		},
	};
}

function nodemailer() {
	const sent = [];
	return { sent, createTransport: () => ({ sendMail: async (mail) => sent.push(mail) }) };
}

module.exports = { stripe, cloudinary, nodemailer };
