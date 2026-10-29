import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { sendSms } from "../services/sms.service.js";

export const smsRouter = Router();

// Send an SMS using the authenticated user's wallet.
smsRouter.post("/send", requireAuth, async (req, res, next) => {
  try {
    const { to, message } = req.body || {};

    // Use the authenticated user's ID, never an ID supplied by the client.
    const result = await sendSms(req.user.id, to, message);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
