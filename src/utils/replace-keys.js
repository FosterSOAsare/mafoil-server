const escapeHtml = (value) =>
	String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// Replaces each literal tag (e.g. "{{ MESSAGE }}") in an HTML template with its HTML-escaped value.
// Tags are matched literally (not as regexes) and values can't inject markup or `$&`-style patterns.
function replaceKeys(text, keys) {
	keys.forEach((e) => {
		text = text.split(e.tag).join(escapeHtml(e.value));
	});
	return text;
}

module.exports = replaceKeys;
