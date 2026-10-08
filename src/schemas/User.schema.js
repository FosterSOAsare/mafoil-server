const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

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
		code: {
			required: false,
			type: String,
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
userSchema.methods.storeCode = async function (code) {
	try {
		const salt = await bcrypt.genSalt(10);
		const hashedcode = await bcrypt.hash(code, salt);
		this.code = hashedcode;
	} catch (error) {
		throw error;
	}
};
userSchema.methods.compareCode = async function (code) {
	try {
		return await bcrypt.compare(code, this.code);
	} catch (error) {
		throw error;
	}
};
userSchema.methods.updatePassword = async function (password) {
	try {
		this.password = password;
		this.code = undefined;
	} catch (error) {
		throw error;
	}
};

// Used by the delete-unverified-users cron
userSchema.index({ verified: 1, createdAt: 1 });

module.exports = mongoose.model("User", userSchema);
