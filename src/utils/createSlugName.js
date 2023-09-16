const createSlugName = (name) => {
	return name.toLowerCase().trim().replace(/\s+/g, "-");
};

module.exports = createSlugName;
