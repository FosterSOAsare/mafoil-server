const asyncHandler = require("express-async-handler");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const nodemailer = require("nodemailer");

const sendEmail = asyncHandler(async (subject, message, to, reply_to) => {
	let transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: 465,
		secure: true,
		auth: {
			user: process.env.EMAIL_ADDRESS,
			pass: process.env.EMAIL_PASSWORD,
		},
		tls: {
			rejectUnauthorized: true,
		},
	});
	await transporter.sendMail({
		from: `Mail.fo <${process.env.EMAIL_ADDRESS}>`,
		to: to,
		subject: subject,
		html: message,
		replyTo: reply_to ? reply_to : "",
	});
	console.log("Mail successfull sent");
	return { success: true };
});

const replaceKeys = require("../utils/replace-keys");

const sendPasswordResetEmail = asyncHandler(async (email, code) => {
	let template = fs.readFileSync(path.join(__dirname, "..", "email-templates", "reset-password.html"), "utf-8");
	let keys = [
		{
			tag: "{{ CODE }}",
			value: code,
		},
	];
	let message = replaceKeys(template, keys);
	await sendEmail("Password Reset", message, email);
	console.log("Password reset email sent to " + email + " code is " + code);
});

const sendEmailVerificationEmail = asyncHandler(async (email, code) => {
	let template = fs.readFileSync(path.join(__dirname, "..", "email-templates", "verify-email.html"), "utf-8");
	let keys = [
		{
			tag: "{{ CODE }}",
			value: code,
		},
	];
	let message = replaceKeys(template, keys);
	await sendEmail("Account Verification", message, email);
	console.log("Email verification mail sent to " + email + " code is " + code);
});
const sendContactEmail = asyncHandler(async (data) => {
	const { name, email, message, subject, site } = data;
	let template = fs.readFileSync(path.join(__dirname, "..", "email-templates", `${site === "xennol" ? "xennol-contact.html" : "contact-us.html"}`), "utf-8");
	let keys = [
		{
			tag: "{{ MESSAGE }}",
			value: message,
		},
		{
			tag: "{{ SUBJECT }}",
			value: subject,
		},
		{
			tag: "{{ NAME }}",
			value: name,
		},
	];
	let emailMessage = replaceKeys(template, keys);
	await sendEmail(subject, emailMessage, site === "xennol" ? process.env.XENNOL_SUPPORT_EMAIL : process.env.SUPPORT_EMAIL, email, "xennol");
});

module.exports = { sendPasswordResetEmail, sendEmailVerificationEmail, sendContactEmail };
