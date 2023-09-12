function replaceKeys(text, keys) {
	keys.forEach((e) => {
		let reg = new RegExp(e.tag, "ig");
		text = text.replace(reg, e.value);
	});
	return text;
}

module.exports = replaceKeys;
