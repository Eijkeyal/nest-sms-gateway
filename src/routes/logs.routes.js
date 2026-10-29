import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getLogs } from "../services/logs.service.js";

export const logsRouter = Router();

// Return the authenticated user's message logs.
logsRouter.get("/logs", requireAuth, async (req, res, next) => {
  try {
    const result = await getLogs(req.user.id, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
