import "dotenv/config";

// Validate required environment variables at startup.
const required = ["DATABASE_URL", "JWT_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

const port = Number.parseInt(process.env.PORT || "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number");
}

export const config = {
  env: process.env.NODE_ENV || "development",
  port,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: "7d",

  // SMS encoding limits for single and multipart messages.
  sms: {
    GSM7_SINGLE: 160,
    GSM7_MULTI: 153,
    UCS2_SINGLE: 70,
    UCS2_MULTI: 67,
  },

  creditPerPart: 1,
  initialCredits: 100,

  status: {
    PENDING: "pending",
    SENT: "sent",
    FAILED: "failed",
  },
};
