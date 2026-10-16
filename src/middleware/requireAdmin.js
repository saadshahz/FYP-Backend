const { pool } = require("../config/database");

async function requireAdmin(req, res, next) {
  try {
    const result = await pool.query(
      "SELECT 1 FROM users WHERE id = $1 AND status = 'active' AND platform_role = 'admin'",
      [req.auth.userId]
    );
    if (result.rowCount !== 1) {
      return res.status(403).json({ error: "Administrator access is required." });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requireAdmin;
