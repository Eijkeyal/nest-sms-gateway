/**
 * Database Migration Runner
 *
 * Applies SQL migrations in alphabetical order and records each
 * successful migration in schema_migrations.
 *
 * Each migration runs in its own transaction. A PostgreSQL advisory
 * lock prevents multiple migration runners from applying migrations
 * concurrently.
 *
 * Usage: npm run migrate
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";
import { config } from "../src/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, "..", "src", "migrations");
const TRACKING_TABLE = "schema_migrations";

// Use a consistent lock key across all instances of this migration runner.
const LOCK_KEY_1 = 748291;
const LOCK_KEY_2 = 1;

async function main() {
  let client;
  let lockAcquired = false;
  let migrationFailed = false;

  try {
    client = await pool.connect();

    // Serialize migration runs across application instances.
    await client.query("SELECT pg_advisory_lock($1, $2)", [
      LOCK_KEY_1,
      LOCK_KEY_2,
    ]);
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    console.log(
      `Found ${files.length} migration(s) for environment: ${config.env}`,
    );

    for (const file of files) {
      const { rows } = await client.query(
        `SELECT 1 FROM ${TRACKING_TABLE} WHERE name = $1`,
        [file],
      );

      if (rows.length > 0) {
        console.log(`SKIP  ${file} (already applied)`);
        continue;
      }

      console.log(`APPLY ${file}`);

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

      let transactionStarted = false;

      try {
        await client.query("BEGIN");
        transactionStarted = true;

        await client.query(sql);

        await client.query(`INSERT INTO ${TRACKING_TABLE} (name) VALUES ($1)`, [
          file,
        ]);

        await client.query("COMMIT");
        transactionStarted = false;

        console.log(`DONE  ${file}`);
      } catch (error) {
        if (transactionStarted) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error(
              `ROLLBACK FAILED for ${file}:`,
              rollbackError.message,
            );
          }
        }

        console.error(`FAILED ${file}:`, error.message);
        migrationFailed = true;
        break;
      }
    }
  } catch (error) {
    console.error("Migration runner failed:", error.message);
    migrationFailed = true;
  } finally {
    if (client) {
      if (lockAcquired) {
        try {
          await client.query("SELECT pg_advisory_unlock($1, $2)", [
            LOCK_KEY_1,
            LOCK_KEY_2,
          ]);
        } catch (error) {
          console.error("Failed to release migration lock:", error.message);
          migrationFailed = true;
        }
      }

      client.release();
    }

    try {
      await pool.end();
    } catch (error) {
      console.error("Failed to close database pool:", error.message);
      migrationFailed = true;
    }
  }

  if (migrationFailed) {
    console.error("Migration process failed.");
    process.exitCode = 1;
    return;
  }

  console.log("All migrations completed successfully.");
}

main().catch((error) => {
  // Final safeguard for unexpected errors.
  console.error("Unexpected migration runner error:", error);
  process.exitCode = 1;
});
