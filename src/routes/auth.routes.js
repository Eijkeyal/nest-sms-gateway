// src/routes/auth.routes.js
import { Router } from "express";
import * as authService from "../services/auth.service.js";

export const authRouter = Router();

// POST /auth/register
authRouter.post("/register", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.register(email, password);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
