import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { pool, withTransaction } from "../src/db.js";
import { deliverMessage } from "../src/services/failover.js";

async function createTestMessage() {
  return withTransaction(async (client) => {
    const email = `failover-${Date.now()}-${Math.random()}@example.com`;
    const userRes = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'h') RETURNING id",
      [email],
    );
    const userId = userRes.rows[0].id;

    const msgRes = await client.query(
      `INSERT INTO messages (user_id, message_body, encoding, parts_per_message, recipient_count, total_cost)
       VALUES ($1, 'test', 'GSM7', 1, 1, 1) RETURNING id`,
      [userId],
    );
    const messageId = msgRes.rows[0].id;

    const recRes = await client.query(
      `INSERT INTO message_recipients (message_id, phone_number, cost)
       VALUES ($1, '9841234567', 1) RETURNING id`,
      [messageId],
    );
    const recipientId = recRes.rows[0].id;

    return { userId, messageId, recipientId };
  });
}

describe("Failover Logic", () => {
  let userId, messageId, recipientId;
  const COST = 2;

  beforeAll(async () => {
    const setup = await createTestMessage();
    userId = setup.userId;
    messageId = setup.messageId;
    recipientId = setup.recipientId;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("UPDATE providers SET balance = 500, failure_rate = 0");
  });

  it("should use ROUTE_A first if it succeeds and deduct provider balance", async () => {
    const result = await withTransaction((client) =>
      deliverMessage(client, messageId, recipientId, COST),
    );
    expect(result.success).toBe(true);
    expect(result.providerUsed).toBe("ROUTE_A");

    const p = await pool.query(
      "SELECT balance FROM providers WHERE name = 'ROUTE_A'",
    );
    expect(Number(p.rows[0].balance)).toBe(498);
  });

  it("should failover to ROUTE_B if ROUTE_A fails", async () => {
    await pool.query(
      "UPDATE providers SET failure_rate = 1 WHERE name = 'ROUTE_A'",
    );

    const result = await withTransaction((client) =>
      deliverMessage(client, messageId, recipientId, COST),
    );
    expect(result.success).toBe(true);
    expect(result.providerUsed).toBe("ROUTE_B");

    const pA = await pool.query(
      "SELECT balance FROM providers WHERE name = 'ROUTE_A'",
    );
    expect(Number(pA.rows[0].balance)).toBe(500);

    const pB = await pool.query(
      "SELECT balance FROM providers WHERE name = 'ROUTE_B'",
    );
    expect(Number(pB.rows[0].balance)).toBe(498);
  });

  it("should skip a provider if its balance is less than the cost", async () => {
    await pool.query(
      "UPDATE providers SET failure_rate = 1 WHERE name = 'ROUTE_A'",
    );
    await pool.query("UPDATE providers SET balance = 1 WHERE name = 'ROUTE_B'");

    const result = await withTransaction((client) =>
      deliverMessage(client, messageId, recipientId, COST),
    );
    expect(result.success).toBe(true);
    expect(result.providerUsed).toBe("ROUTE_C");
  });

  it("should return success=false if ALL providers fail or lack balance", async () => {
    await pool.query("UPDATE providers SET failure_rate = 1");
    const result = await withTransaction((client) =>
      deliverMessage(client, messageId, recipientId, COST),
    );
    expect(result.success).toBe(false);
    expect(result.providerUsed).toBeNull();
  });
});
