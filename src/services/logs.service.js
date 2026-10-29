// src/services/logs.service.js
import { query } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { normalizePhone } from "./phone.js";

// Require a timezone on full timestamps to avoid inconsistent parsing.
function isValidIsoDate(value) {
  if (typeof value !== "string") return false;

  const isoRegex =
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/;
  if (!isoRegex.test(value)) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  // JavaScript may normalize invalid dates, such as February 30, into March.
  if (value.length === 10) {
    return date.toISOString().slice(0, 10) === value;
  }

  return true;
}

export async function getLogs(userId, filters) {
  let { status, from, to, number, page = 1, limit = 10 } = filters;

  page = Number(page);
  limit = Number(limit);

  if (!Number.isInteger(page) || page < 1) {
    throw new ApiError(400, "INVALID_PAGE", "Page must be a positive integer");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError(
      400,
      "INVALID_LIMIT",
      "Limit must be an integer between 1 and 100",
    );
  }

  if (status) {
    const allowed = ["pending", "sent", "failed"];
    if (!allowed.includes(status)) {
      throw new ApiError(
        400,
        "INVALID_STATUS",
        `Status must be one of: ${allowed.join(", ")}`,
      );
    }
  }

  let fromDate = null;
  let toDate = null;

  if (from) {
    if (!isValidIsoDate(from)) {
      throw new ApiError(
        400,
        "INVALID_DATE",
        "The 'from' date must be valid ISO (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)",
      );
    }
    fromDate = new Date(from);
  }

  if (to) {
    if (!isValidIsoDate(to)) {
      throw new ApiError(
        400,
        "INVALID_DATE",
        "The 'to' date must be valid ISO (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)",
      );
    }
    toDate = new Date(to);

    // Include the whole day when the user supplies a date without a time.
    if (to.length === 10) {
      toDate.setUTCHours(23, 59, 59, 999);
    }
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw new ApiError(
      400,
      "INVALID_DATE_RANGE",
      "'from' date cannot be after 'to' date",
    );
  }

  let normalizedNumber = null;
  if (number) {
    const phoneCheck = normalizePhone(number);
    if (!phoneCheck.valid) {
      throw new ApiError(
        400,
        "INVALID_PHONE_FILTER",
        `Invalid phone number format: ${phoneCheck.error}`,
      );
    }
    normalizedNumber = phoneCheck.normalized;
  }

  let queryText = "SELECT * FROM messages WHERE user_id = $1";
  const values = [userId];
  let paramCount = 2;

  if (status) {
    queryText += ` AND status = $${paramCount++}`;
    values.push(status);
  }
  if (fromDate) {
    queryText += ` AND created_at >= $${paramCount++}`;
    values.push(fromDate);
  }
  if (toDate) {
    queryText += ` AND created_at <= $${paramCount++}`;
    values.push(toDate);
  }
  if (normalizedNumber) {
    queryText += ` AND id IN (SELECT message_id FROM message_recipients WHERE phone_number = $${paramCount++})`;
    values.push(normalizedNumber);
  }

  const countResult = await query(
    `SELECT COUNT(*) FROM (${queryText}) AS filtered`,
    values,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  queryText += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
  values.push(limit, (page - 1) * limit);

  const result = await query(queryText, values);

  return {
    data: result.rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
