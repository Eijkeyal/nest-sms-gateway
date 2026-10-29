import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getRouteHealth } from "../services/health.service.js";

export const healthRouter = Router();
//GET/routes/health
healthRouter.get("/health", requireAuth, async (req, res, next) => {
  try {
    const result = await getRouteHealth();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
