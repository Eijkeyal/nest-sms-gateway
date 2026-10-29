import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, withTransaction } from "../src/db.js";
import {
  deductCredits,
  refundRecipient,
} from "../src/services/wallet.service.js";

async function createTestUserWithMessage(initialBalance, cost) {
  return withTransaction(async (client) => {
    const email = `wallet-${Date.now()}-${Math.random()}@example.com`;
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

    const recRes = await client.query(
      `INSERT INTO message_recipients (message_id, phone_number, cost, status)
       VALUES ($1, '9841234567', $2, 'pending') RETURNING id`,
      [messageId, cost],
    );
    const recipientId = recRes.rows[0].id;

    return { userId, messageId, recipientId };
  });
}

describe("Wallet Service — Atomic Deduction", () => {
  let userId, messageId;

  beforeAll(async () => {
    const setup = await createTestUserWithMessage(10, 1);
    userId = setup.userId;
    messageId = setup.messageId;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    // DO NOT PUT pool.end() HERE. The second describe block needs the pool!
  });

  it("should deduct credits when balance is sufficient", async () => {
    const balance = await withTransaction((client) =>
      deductCredits(client, userId, 3, messageId),
    );
    expect(balance).toBe(7);
  });

  it("should reject if insufficient credits", async () => {
    await expect(
      withTransaction((client) =>
        deductCredits(client, userId, 1000, messageId),
      ),
    ).rejects.toThrow("Insufficient credits");
  });

  it("should reject cost <= 0", async () => {
    await expect(
      withTransaction((client) => deductCredits(client, userId, 0, messageId)),
    ).rejects.toThrow("Cost must be a positive integer");
  });

  it("should not allow balance to go negative", async () => {
    const result = await pool.query(
      "SELECT balance FROM wallets WHERE user_id = $1",
      [userId],
    );
    expect(result.rows[0].balance).toBeGreaterThanOrEqual(0);
  });
});

describe("Wallet Service — Refund Eligibility", () => {
  let userId, recipientId;

  beforeAll(async () => {
    const setup = await createTestUserWithMessage(100, 5);
    userId = setup.userId;
    recipientId = setup.recipientId;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end(); // <--- PUT pool.end() HERE. This is the end of the file.
  });

  it("should NOT refund a recipient that isn't marked failed", async () => {
    const result = await withTransaction((client) =>
      refundRecipient(client, recipientId),
    );
    expect(result.refunded).toBe(false);
    expect(result.amount).toBe(0);
  });

  it("should refund a recipient once marked failed", async () => {
    await pool.query(
      "UPDATE message_recipients SET status = 'failed' WHERE id = $1",
      [recipientId],
    );
    const before = await pool.query(
      "SELECT balance FROM wallets WHERE user_id = $1",
      [userId],
    );
    const beforeBalance = before.rows[0].balance;

    const result = await withTransaction((client) =>
      refundRecipient(client, recipientId),
    );
    expect(result.refunded).toBe(true);
    expect(result.amount).toBe(5);

    const after = await pool.query(
      "SELECT balance FROM wallets WHERE user_id = $1",
      [userId],
    );
    expect(after.rows[0].balance).toBe(beforeBalance + 5);
  });

  it("should not double-refund the same recipient", async () => {
    const result = await withTransaction((client) =>
      refundRecipient(client, recipientId),
    );
    expect(result.refunded).toBe(false);
    expect(result.amount).toBe(0);
  });
});
