const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");
const { jwtExpiresIn, jwtIssuer, jwtSecret } = require("../config/auth");
const authRepository = require("../repositories/authRepository");

const bcryptRounds = 12;
let dummyPasswordHash;

async function register(input) {
  const passwordHash = await bcrypt.hash(input.password, bcryptRounds);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const registration = await authRepository.createRegistration(client, input, passwordHash);
    if (!registration) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("COMMIT");
    return registration;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && /users_email/i.test(error.constraint || "")) {
      return null;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function login(email, password) {
  const user = await authRepository.findUserByEmail(pool, email);
  if (!user && !dummyPasswordHash) {
    dummyPasswordHash = bcrypt.hash("not-a-real-user-password", bcryptRounds);
  }
  const passwordMatches = await bcrypt.compare(
    password,
    user ? user.password_hash : await dummyPasswordHash
  );

  if (!user || !passwordMatches || user.status !== "active") {
    return null;
  }

  if (!(await authRepository.markLogin(pool, user.id))) {
    return null;
  }

  const token = jwt.sign({}, jwtSecret, {
    algorithm: "HS256",
    subject: user.id,
    issuer: jwtIssuer,
    expiresIn: jwtExpiresIn,
  });

  return { accessToken: token, tokenType: "Bearer", expiresIn: 3600 };
}

async function getProfile(userId) {
  return authRepository.findActiveProfile(pool, userId);
}

module.exports = { getProfile, login, register };
