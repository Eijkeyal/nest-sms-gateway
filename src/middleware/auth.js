import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { ApiError } from "./error.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(
      new ApiError(
        401,
        "MISSING_TOKEN",
        "Authorization header with Bearer token required",
      ),
    );
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret);

    req.user = {
      id: payload.userId,
      email: payload.email,
    };

    next();
  } catch (err) {
    return next(new ApiError(401, "INVALID_TOKEN", "Invalid or expired token"));
  }
}
