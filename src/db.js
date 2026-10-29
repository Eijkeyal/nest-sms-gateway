import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 20,
});

// Handle unexpected errors from idle pool connections.
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

export const query = (text, params) => pool.query(text, params);

// Keep all operations in a transaction on the same connection.
export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Transaction rollback failed:", rollbackError);
    }
    throw err;
  } finally {
    client.release();
  }
}
