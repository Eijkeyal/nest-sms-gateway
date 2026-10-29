// src/app.js
import express from "express";
import { authRouter } from "./routes/auth.routes.js";
import { smsRouter } from "./routes/sms.routes.js";
import { logsRouter } from "./routes/logs.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { errorHandler } from "./middleware/error.js";

export const app = express();

// Parse incoming JSON request bodies.
app.use(express.json());

// Public health check for service monitoring.
app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Register API routes.
app.use("/auth", authRouter);
app.use("/sms", smsRouter);
app.use("/sms", logsRouter);
app.use("/routes", healthRouter);

// Handle requests to undefined endpoints.
app.use((req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

// Handle errors from routes and middleware.
app.use(errorHandler);
