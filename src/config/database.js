const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});

pool.on("error", () => {
  console.error("Unexpected error from an idle PostgreSQL client.");
});

module.exports = { pool };
