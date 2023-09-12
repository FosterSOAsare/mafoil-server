function generateCode(length = 6) {
	let alp = "1234567890";
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += alp[Math.floor(Math.random() * alp.length)];
	}
	return code;
}

module.exports = generateCode;
