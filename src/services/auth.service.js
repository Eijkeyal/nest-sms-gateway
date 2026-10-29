import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { withTransaction, query } from "../db.js";
import { config } from "../config.js";
import { ApiError } from "../middleware/error.js";

const BCRYPT_ROUNDS = 10;

export async function register(email, password) {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    throw new ApiError(400, "INVALID_EMAIL", "A valid email is required");
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    throw new ApiError(
      400,
      "INVALID_PASSWORD",
      "Password must be at least 6 characters",
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  return await withTransaction(async (client) => {
    let userRow;

    try {
      const result = await client.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at`,
        [email, passwordHash],
      );

      userRow = result.rows[0];
    } catch (err) {
      if (err.code === "23505") {
        throw new ApiError(
          409,
          "EMAIL_EXISTS",
          "An account with this email already exists",
        );
      }

      throw err;
    }

    const walletResult = await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, $2)
       RETURNING id, balance`,
      [userRow.id, config.initialCredits],
    );

    const wallet = walletResult.rows[0];

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, message_id)
       VALUES ($1, 'refund', $2, NULL)`,
      [wallet.id, config.initialCredits],
    );

    const token = jwt.sign(
      { userId: userRow.id, email: userRow.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn },
    );

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        createdAt: userRow.created_at,
      },
      wallet: { balance: wallet.balance },
      token,
    };
  });
}

export async function login(email, password) {
  if (!email || !password) {
    throw new ApiError(
      400,
      "MISSING_CREDENTIALS",
      "Email and password are required",
    );
  }

  const result = await query(
    `SELECT u.id, u.email, u.password_hash, w.balance
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.email = $1`,
    [email],
  );

  const row = result.rows[0];

  if (!row) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, row.password_hash);

  if (!valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const token = jwt.sign(
    { userId: row.id, email: row.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );

  return {
    user: { id: row.id, email: row.email },
    wallet: { balance: row.balance },
    token,
  };
}
