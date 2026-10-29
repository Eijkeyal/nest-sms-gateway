// src/services/segmenter.js
import { config } from "../config.js";
import { ApiError } from "../middleware/error.js";

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ " +
  "!\"#¤%&'()*+,-./0123456789:;<=>?¡" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿" +
  "abcdefghijklmnopqrstuvwxyzäöñüàç";

const GSM7_EXTENSION = new Set([
  "\f",
  "^",
  "{",
  "}",
  "\\",
  "[",
  "~",
  "]",
  "|",
  "€",
]);

function isGsm7(message) {
  for (const char of message) {
    if (!GSM7_BASIC.includes(char) && !GSM7_EXTENSION.has(char)) {
      return false;
    }
  }
  return true;
}

function countGsm7Septets(message) {
  let septets = 0;
  for (const char of message) {
    // Extension-table characters use an escape character, so they count as two septets.
    septets += GSM7_EXTENSION.has(char) ? 2 : 1;
  }
  return septets;
}

export function calculateSegments(message) {
  if (typeof message !== "string" || message.length === 0) {
    throw new ApiError(
      400,
      "INVALID_MESSAGE",
      "Message must be a non-empty string",
    );
  }

  if (message.trim().length === 0) {
    throw new ApiError(
      400,
      "INVALID_MESSAGE",
      "Message must contain at least one non-whitespace character",
    );
  }

  if (isGsm7(message)) {
    const length = countGsm7Septets(message);
    const parts =
      length <= config.sms.GSM7_SINGLE
        ? 1
        : Math.ceil(length / config.sms.GSM7_MULTI);
    return { encoding: "GSM7", parts };
  }

  // Unicode messages use different single-part and multipart limits.
  const length = message.length;
  const parts =
    length <= config.sms.UCS2_SINGLE
      ? 1
      : Math.ceil(length / config.sms.UCS2_MULTI);
  return { encoding: "UCS2", parts };
}
