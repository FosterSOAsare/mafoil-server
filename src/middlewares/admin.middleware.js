// Runs after the user middleware: the caller is logged in (401 handled there) but must also be an admin
const admin = (req, res, next) => {
	if (!req.user?.is_admin) {
		return res.status(403).json({ error: "User is not authorized to perform this action" });
	}
	next();
};

module.exports = admin;
