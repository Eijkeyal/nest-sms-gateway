import { withTransaction } from "../db.js";
import { config } from "../config.js";
import { ApiError } from "../middleware/error.js";
import { normalizePhone } from "./phone.js";
import { calculateSegments } from "./segmenter.js";
import { deductCredits, refundRecipient } from "./wallet.service.js";
import { deliverMessage } from "./failover.js";

export async function sendSms(userId, toArray, message) {
  if (!Array.isArray(toArray) || toArray.length === 0) {
    throw new ApiError(
      400,
      "INVALID_RECIPIENTS",
      "A non-empty array of 'to' numbers is required",
    );
  }

  if (toArray.length > 100) {
    throw new ApiError(
      400,
      "TOO_MANY_RECIPIENTS",
      "A maximum of 100 recipients is allowed per request",
    );
  }

  const normalizedNumbers = [];
  for (const raw of toArray) {
    const res = normalizePhone(raw);
    if (!res.valid) {
      throw new ApiError(
        400,
        "INVALID_PHONE",
        `Invalid phone number '${raw}': ${res.error}`,
      );
    }
    normalizedNumbers.push(res.normalized);
  }

  const { encoding, parts } = calculateSegments(message);
  const costPerRecipient = parts * config.creditPerPart;
  const totalCost = costPerRecipient * normalizedNumbers.length;

  // Keep charging, delivery records, and refunds consistent if the operation fails.
  // Delivery is synchronous here; a production gateway would usually use a queue.
  const result = await withTransaction(async (client) => {
    const msgRes = await client.query(
      `INSERT INTO messages (user_id, message_body, encoding, parts_per_message, recipient_count, total_cost, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
      [userId, message, encoding, parts, normalizedNumbers.length, totalCost],
    );
    const messageId = msgRes.rows[0].id;

    await deductCredits(client, userId, totalCost, messageId);

    const recipientIds = [];
    for (const phone of normalizedNumbers) {
      const r = await client.query(
        `INSERT INTO message_recipients (message_id, phone_number, cost, status)
         VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [messageId, phone, costPerRecipient],
      );
      recipientIds.push(r.rows[0].id);
    }

    let successCount = 0;
    for (const recipientId of recipientIds) {
      const delivery = await deliverMessage(
        client,
        messageId,
        recipientId,
        costPerRecipient,
      );

      if (delivery.success) {
        await client.query(
          `UPDATE message_recipients SET status = 'sent', provider_used = $1 WHERE id = $2`,
          [delivery.providerUsed, recipientId],
        );
        successCount++;
      } else {
        await client.query(
          `UPDATE message_recipients SET status = 'failed' WHERE id = $1`,
          [recipientId],
        );

        // Mark the recipient as failed before refunding its credits.
        await refundRecipient(client, recipientId);
      }
    }

    const failedCount = normalizedNumbers.length - successCount;

    // A message is considered sent if at least one recipient receives it.
    const finalStatus = successCount > 0 ? "sent" : "failed";

    await client.query(`UPDATE messages SET status = $1 WHERE id = $2`, [
      finalStatus,
      messageId,
    ]);

    return {
      messageId,
      status: finalStatus,
      costCharged: successCount * costPerRecipient,
      totalCost,
      totalRecipients: normalizedNumbers.length,
      successRecipients: successCount,
      failedRecipients: failedCount,
    };
  });

  return result;
}
