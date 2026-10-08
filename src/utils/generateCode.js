const crypto = require("crypto");

// Cryptographically random numeric code (Math.random is predictable)
function generateCode(length = 6) {
	let code = "";
	for (let i = 0; i < length; i++) {
		code += crypto.randomInt(0, 10);
	}
	return code;
}

module.exports = generateCode;
