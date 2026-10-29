// src/services/wallet.service.js
import { ApiError } from "../middleware/error.js";

export async function deductCredits(client, userId, cost, messageId) {
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new ApiError(400, "INVALID_COST", "Cost must be a positive integer");
  }

  if (
    messageId === undefined ||
    messageId === null ||
    !/^[1-9]\d*$/.test(String(messageId))
  ) {
    throw new ApiError(
      400,
      "INVALID_MESSAGE_ID",
      "A valid messageId is required",
    );
  }

  // Deduct only if the wallet has enough credits; the check and update happen together.
  const result = await client.query(
    `UPDATE wallets
     SET balance = balance - $1
     WHERE user_id = $2 AND balance >= $1
     RETURNING id, balance`,
    [cost, userId],
  );

  if (result.rowCount === 0) {
    const exists = await client.query(
      "SELECT 1 FROM wallets WHERE user_id = $1",
      [userId],
    );

    if (exists.rowCount === 0) {
      throw new ApiError(404, "WALLET_NOT_FOUND", "Wallet not found for user");
    }

    throw new ApiError(402, "INSUFFICIENT_CREDITS", "Insufficient credits");
  }

  const wallet = result.rows[0];

  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, type, amount, message_id)
     VALUES ($1, 'deduct', $2, $3)`,
    [wallet.id, cost, messageId],
  );

  return wallet.balance;
}

/**
 * Refunds a recipient that failed on every route.
 * Must run inside the caller's transaction.
 */
export async function refundRecipient(client, recipientId) {
  // Claim the refund first so the same recipient cannot be refunded twice.
  const flipResult = await client.query(
    `UPDATE message_recipients
     SET refunded = true
     WHERE id = $1 AND status = 'failed' AND refunded = false
     RETURNING message_id, cost`,
    [recipientId],
  );

  if (flipResult.rowCount === 0) {
    return { refunded: false, amount: 0 };
  }

  const { message_id, cost } = flipResult.rows[0];

  if (!Number.isInteger(cost) || cost <= 0) {
    throw new ApiError(
      500,
      "INVALID_RECIPIENT_COST",
      `Recipient ${recipientId} has invalid cost: ${cost}`,
    );
  }

  const msgResult = await client.query(
    "SELECT user_id FROM messages WHERE id = $1",
    [message_id],
  );

  if (msgResult.rowCount === 0) {
    throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found");
  }

  const userId = msgResult.rows[0].user_id;

  const walletResult = await client.query(
    `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2 RETURNING id`,
    [cost, userId],
  );

  if (walletResult.rowCount === 0) {
    throw new ApiError(404, "WALLET_NOT_FOUND", "Wallet not found");
  }

  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, type, amount, message_id)
     VALUES ($1, 'refund', $2, $3)`,
    [walletResult.rows[0].id, cost, message_id],
  );

  return { refunded: true, amount: cost };
}
