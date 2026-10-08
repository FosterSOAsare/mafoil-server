// Slugs that would collide with fixed product routes (/products/search, /products/edit/..., ...)
const RESERVED_SLUGS = ["search", "categories", "edit", "recents", "new"];

// Builds a URL-safe slug: lowercase letters, digits and single hyphens only
const createSlugName = (name) => {
	let slug = String(name)
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // strip accents
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80)
		.replace(/-+$/g, "");
	if (!slug) slug = "product";
	if (RESERVED_SLUGS.includes(slug)) slug = `${slug}-item`;
	return slug;
};

module.exports = createSlugName;
