const allowedMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const allowedHeaders = new Set(["authorization", "content-type"]);

function parseAllowedOrigins() {
  const configured = process.env.FRONTEND_ORIGINS || "http://localhost:3000";
  const origins = configured.split(",").map((origin) => origin.trim()).filter(Boolean);

  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("FRONTEND_ORIGINS must contain valid HTTP(S) origins.");
    }

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("FRONTEND_ORIGINS must contain exact HTTP(S) origins without paths or credentials.");
    }
  }

  return new Set(origins);
}

const allowedOrigins = parseAllowedOrigins();

function cors(req, res, next) {
  const origin = req.get("Origin");
  if (!origin) return next();

  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  res.vary("Origin");
  res.set("Access-Control-Allow-Origin", origin);

  if (req.method === "OPTIONS") {
    const requestedMethod = req.get("Access-Control-Request-Method")?.toUpperCase();
    const requestedHeaders = (req.get("Access-Control-Request-Headers") || "")
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);

    if (
      !requestedMethod ||
      !allowedMethods.has(requestedMethod) ||
      requestedHeaders.some((header) => !allowedHeaders.has(header))
    ) {
      return res.status(403).json({ error: "CORS preflight request not allowed." });
    }

    res.set("Access-Control-Allow-Methods", [...allowedMethods].join(", "));
    res.set("Access-Control-Allow-Headers", [...allowedHeaders].join(", "));
    res.set("Access-Control-Max-Age", "600");
    return res.status(204).end();
  }

  if (!allowedMethods.has(req.method)) {
    return res.status(405).json({ error: "Method not allowed." });
  }

  return next();
}

module.exports = cors;
