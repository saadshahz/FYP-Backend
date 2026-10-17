require("dotenv").config();

let pool;
let server;
let shutdownPromise;

async function closeResources() {
  let failed = false;

  if (server) {
    try {
      const closeServer = new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      if (typeof server.closeIdleConnections === "function") {
        server.closeIdleConnections();
      }
      await closeServer;
    } catch {
      console.error("Failed to close the HTTP server.");
      failed = true;
    }
  }

  if (pool) {
    try {
      await pool.end();
    } catch {
      console.error("Failed to close the PostgreSQL connection pool.");
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

function shutdown(signal) {
  if (!shutdownPromise) {
    console.log(`${signal} received; shutting down`);
    shutdownPromise = closeResources();
  }

  return shutdownPromise;
}

async function start() {
  try {
    const { port } = require("./src/config");
    ({ pool } = require("./src/config/database"));
    const app = require("./src/app");

    await pool.query("SELECT 1");

    server = app.listen(port);
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    console.log(`API server listening on port ${port}`);
    console.log(`API server documentation available at http://localhost:${port}/api/docs`);
  } catch (error) {
    if (
      error &&
      error.message === "JWT_SECRET must be a non-placeholder secret of at least 32 bytes"
    ) {
      console.error("Application startup failed: set JWT_SECRET to a random secret of at least 32 bytes.");
    } else if (error && (error.code === "28P01" || error.code === "28000")) {
      console.error(
        "Application startup failed: PostgreSQL rejected authentication. Check the Supabase database username and password in DATABASE_URL."
      );
    } else {
      console.error("Application startup failed; check PORT and DATABASE_URL configuration.");
    }
    await closeResources();
    process.exitCode = 1;
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

start();