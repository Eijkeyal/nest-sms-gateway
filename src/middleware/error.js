// src/middleware/error.js

export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Handle malformed JSON from express.json()
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({
      error: "Invalid JSON in request body",
      code: "INVALID_JSON",
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || "INTERNAL_ERROR";
  const message = err.message || "Something went wrong";

  res.status(statusCode).json({ error: message, code });
}
