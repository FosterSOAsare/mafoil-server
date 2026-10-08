const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const CODE_LIFETIME_MS = 15 * 60 * 1000; // Emailed codes expire after 15 minutes
const RESET_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

const userSchema = mongoose.Schema(
	{
		email: {
			required: true,
			type: String,
			lowercase: true,
			trim: true,
			unique: true,
		},
		password: {
			required: true,
			type: String,
		},
		// Emailed 6-digit code (bcrypt hash), what it is for, when it expires and how many guesses were made
		code: {
			required: false,
			type: String,
		},
		codePurpose: {
			type: String,
			enum: ["accountverification", "resetpassword"],
		},
		codeExpires: Date,
		codeAttempts: {
			type: Number,
			default: 0,
		},
		// Single-use password reset token issued after the reset code is verified (SHA-256 hash)
		resetTokenHash: String,
		resetTokenExpires: Date,
		// Included in every JWT; incrementing it invalidates all existing logins
		tokenVersion: {
			type: Number,
			default: 0,
		},
		verified: {
			required: true,
			type: Boolean,
			default: false,
		},
		fullname: {
			type: String,
			required: true,
		},
		referrer: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		balance: {
			type: Number,
			default: 0,
			min: 0,
		},
		activated: {
			type: Boolean,
			default: false,
		},
		is_admin: {
			type: Boolean,
			default: false,
			immutable: true,
		},
	},
	{
		timestamps: true,
	}
);
userSchema.pre("save", async function (next) {
	// Only hash the password if it's new or modified
	if (!this.isModified("password")) {
		return next();
	}

	try {
		await this.hashPassword();
		next();
	} catch (error) {
		return next(error);
	}
});
userSchema.methods.comparePassword = async function (password) {
	try {
		return await bcrypt.compare(password, this.password);
	} catch (error) {
		throw error;
	}
};
userSchema.methods.hashPassword = async function (password) {
	try {
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(this.password, salt);
		this.password = hashedPassword;
	} catch (error) {
		throw error;
	}
};
userSchema.methods.storeCode = async function (code, purpose) {
	const salt = await bcrypt.genSalt(10);
	this.code = await bcrypt.hash(code, salt);
	this.codePurpose = purpose;
	this.codeExpires = new Date(Date.now() + CODE_LIFETIME_MS);
	this.codeAttempts = 0;
};
userSchema.methods.clearCode = function () {
	this.code = undefined;
	this.codePurpose = undefined;
	this.codeExpires = undefined;
	this.codeAttempts = 0;
};
// True when an unexpired code for this purpose exists
userSchema.methods.hasActiveCode = function (purpose) {
	return Boolean(this.code && this.codePurpose === purpose && this.codeExpires && this.codeExpires > new Date());
};
// Creates a random reset token, stores only its hash and returns the token itself
userSchema.methods.createResetToken = function () {
	const token = crypto.randomBytes(32).toString("hex");
	this.resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");
	this.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_LIFETIME_MS);
	return token;
};
// Constant-time check of a reset token against the stored hash
userSchema.methods.checkResetToken = function (token) {
	if (typeof token !== "string" || !this.resetTokenHash || !this.resetTokenExpires || this.resetTokenExpires <= new Date()) return false;
	const given = Buffer.from(crypto.createHash("sha256").update(token).digest("hex"));
	const stored = Buffer.from(this.resetTokenHash);
	return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};
userSchema.methods.compareCode = async function (code) {
	try {
		return await bcrypt.compare(code, this.code);
	} catch (error) {
		throw error;
	}
};
// Sets a new password, clears any codes or reset tokens, and logs out every existing session
userSchema.methods.updatePassword = async function (password) {
	this.password = password;
	this.clearCode();
	this.resetTokenHash = undefined;
	this.resetTokenExpires = undefined;
	this.tokenVersion = (this.tokenVersion || 0) + 1;
};

// Used by the delete-unverified-users cron
userSchema.index({ verified: 1, createdAt: 1 });

module.exports = mongoose.model("User", userSchema);
