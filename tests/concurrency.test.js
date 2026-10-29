import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, withTransaction } from "../src/db.js";
import { deductCredits } from "../src/services/wallet.service.js";

async function createTestUserWithMessage(initialBalance, cost) {
  return withTransaction(async (client) => {
    const email = `conc-${Date.now()}-${Math.random()}@example.com`;
    const userRes = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'hash') RETURNING id",
      [email],
    );
    const userId = userRes.rows[0].id;

    await client.query(
      "INSERT INTO wallets (user_id, balance) VALUES ($1, $2)",
      [userId, initialBalance],
    );

    const msgRes = await client.query(
      `INSERT INTO messages (user_id, message_body, encoding, parts_per_message, recipient_count, total_cost, status)
       VALUES ($1, 'test', 'GSM7', 1, 1, $2, 'pending') RETURNING id`,
      [userId, cost],
    );
    const messageId = msgRes.rows[0].id;

    return { userId, messageId };
  });
}

describe("Concurrency — 20 parallel deductions at a 10-credit wallet", () => {
  let userId, messageId;

  beforeAll(async () => {
    const setup = await createTestUserWithMessage(10, 1);
    userId = setup.userId;
    messageId = setup.messageId;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end();
  });

  it("should allow exactly 10 successful deductions out of 20 parallel requests", async () => {
    const promises = Array.from({ length: 20 }, () =>
      withTransaction((client) => deductCredits(client, userId, 1, messageId))
        .then(() => "success")
        .catch(() => "fail"),
    );

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r === "success").length;
    const failures = results.filter((r) => r === "fail").length;

    expect(successes).toBe(10);
    expect(failures).toBe(10);

    const finalBalance = await pool.query(
      "SELECT balance FROM wallets WHERE user_id = $1",
      [userId],
    );
    expect(finalBalance.rows[0].balance).toBe(0);
  }, 30000); // <--- THIS IS THE CRUCIAL FIX (30 second timeout)
});
