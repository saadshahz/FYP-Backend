const jwt = require("jsonwebtoken");
const { jwtIssuer, jwtSecret } = require("../config/auth");

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authenticate(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const claims = jwt.verify(match[1], jwtSecret, {
      algorithms: ["HS256"],
      issuer: jwtIssuer,
    });
    if (!claims || typeof claims !== "object" || !uuidPattern.test(claims.sub || "")) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    req.auth = { userId: claims.sub };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

module.exports = authenticate;
