const secret = process.env.JWT_SECRET;
const isPlaceholder = /replace-with|change-me|placeholder/i.test(secret || "");

if (!secret || Buffer.byteLength(secret, "utf8") < 32 || isPlaceholder) {
  throw new Error("JWT_SECRET must be a non-placeholder secret of at least 32 bytes");
}

module.exports = {
  jwtSecret: secret,
  jwtIssuer: "fyp-backend",
  jwtExpiresIn: "1h",
};
