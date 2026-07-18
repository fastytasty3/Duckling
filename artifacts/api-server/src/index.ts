import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer } from "./lib/ws-server";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Ensure all required tables/types exist in the database.
 * Safe to run on every startup (idempotent).
 * This handles the case where the Replit publish-time schema diff hasn't
 * been applied yet — e.g. right after deploying new code to production.
 */
async function ensureSchema() {
  try {
    // 1. Check which enums already exist (avoids $$ quoting issue with Drizzle sql tag)
    const enumRows = await db.execute(
      sql`SELECT typname FROM pg_type WHERE typname IN ('supervisor_role', 'supervisor_status') AND typtype = 'e'`
    );
    const existingEnums = new Set(
      ((enumRows as any).rows ?? []).map((r: any) => r.typname as string)
    );

    if (!existingEnums.has("supervisor_role")) {
      await db.execute(
        sql.raw(`CREATE TYPE supervisor_role AS ENUM ('supervisor', 'admin')`)
      );
    }
    if (!existingEnums.has("supervisor_status")) {
      await db.execute(
        sql.raw(`CREATE TYPE supervisor_status AS ENUM ('active', 'temp_locked', 'admin_locked', 'must_change_password')`)
      );
    }

    // 2. Create tables (IF NOT EXISTS — safe to re-run)
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS supervisor_accounts (
        id                   SERIAL PRIMARY KEY,
        full_name            TEXT NOT NULL,
        login                TEXT NOT NULL UNIQUE,
        password_hash        TEXT NOT NULL,
        role                 supervisor_role NOT NULL DEFAULT 'supervisor',
        department           TEXT,
        created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        last_login_at        TIMESTAMP,
        status               supervisor_status NOT NULL DEFAULT 'active',
        failed_attempts      INTEGER NOT NULL DEFAULT 0,
        locked_until         TIMESTAMP,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        active               BOOLEAN NOT NULL DEFAULT TRUE
      )
    `));

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS security_log (
        id             SERIAL PRIMARY KEY,
        timestamp      TIMESTAMP NOT NULL DEFAULT NOW(),
        user_id        TEXT,
        user_login     TEXT,
        user_role      TEXT,
        computer       TEXT,
        workplace_id   TEXT,
        workplace_name TEXT,
        ip_address     TEXT,
        action         TEXT NOT NULL,
        result         TEXT NOT NULL,
        description    TEXT
      )
    `));

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS supervisor_sessions (
        id            SERIAL PRIMARY KEY,
        supervisor_id INTEGER NOT NULL,
        token         TEXT NOT NULL UNIQUE,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at    TIMESTAMP NOT NULL,
        invalidated   BOOLEAN NOT NULL DEFAULT FALSE,
        ip_address    TEXT,
        user_agent    TEXT
      )
    `));

    logger.info("Schema check complete");
  } catch (err) {
    logger.error({ err }, "Schema migration failed — continuing anyway");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// Initialize WebSocket server for real-time workstation monitoring
initWebSocketServer(server);

// Run schema migration then start listening
ensureSchema().then(() => {
  server.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}).catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
