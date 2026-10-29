export function normalizePhone(input) {
  if (!input || typeof input !== "string") {
    return { valid: false, error: "Phone number must be a string" };
  }

  let cleaned = input.replace(/[\s\-()]/g, "");

  // Accept Nepali numbers with or without the +977 country code.
  if (cleaned.startsWith("+977")) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith("977")) {
    cleaned = cleaned.slice(3);
  }

  if (!/^\d{10}$/.test(cleaned)) {
    return { valid: false, error: "Must be exactly 10 digits" };
  }

  if (!/^(97|98)/.test(cleaned)) {
    return { valid: false, error: "Must start with 97 or 98" };
  }

  return { valid: true, normalized: cleaned };
}
