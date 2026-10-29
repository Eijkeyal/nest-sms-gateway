// src/services/failover.js
import { ApiError } from "../middleware/error.js";

function attemptMockSend(failureRate) {
  return Math.random() >= failureRate;
}

/**
 * Tries active providers in priority order.
 * Must run inside the caller's transaction.
 */
export async function deliverMessage(client, messageId, recipientId, cost) {
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new ApiError(400, "INVALID_COST", "Cost must be a positive integer");
  }

  const providersRes = await client.query(
    `SELECT id, name, balance, failure_rate
     FROM providers
     WHERE is_active = true
     ORDER BY priority ASC`,
  );

  const providers = providersRes.rows;

  for (const provider of providers) {
    const providerBalance = Number(provider.balance);
    const failureRate = Number(provider.failure_rate);

    if (!Number.isFinite(providerBalance) || providerBalance < cost) {
      continue;
    }

    if (!Number.isFinite(failureRate) || failureRate < 0 || failureRate > 1) {
      throw new ApiError(
        500,
        "INVALID_PROVIDER_CONFIG",
        `Provider ${provider.name} has an invalid failure rate`,
      );
    }

    const isSuccess = attemptMockSend(failureRate);

    if (isSuccess) {
      // Check the balance again during the update to avoid spending credits twice.
      const deductRes = await client.query(
        `UPDATE providers SET balance = balance - $1
         WHERE id = $2 AND balance >= $1 RETURNING id`,
        [cost, provider.id],
      );

      if (deductRes.rowCount === 0) {
        // Another request may have used the remaining balance. Try the next route.
        continue;
      }

      await client.query(
        `INSERT INTO route_attempts (message_id, recipient_id, provider_id, success)
         VALUES ($1, $2, $3, true)`,
        [messageId, recipientId, provider.id],
      );

      return { success: true, providerUsed: provider.name };
    }

    await client.query(
      `INSERT INTO route_attempts (message_id, recipient_id, provider_id, success)
       VALUES ($1, $2, $3, false)`,
      [messageId, recipientId, provider.id],
    );
  }

  // No provider could deliver the message, so the caller can handle the refund.
  return { success: false, providerUsed: null };
}
