import { ExpressAuth } from "@auth/express";
import express from "express";
import cors from "cors";
import { authConfig } from "./auth.js";
import { errorMiddleware } from "./common/errors/errorMiddleware.js";
import { customerRoutes } from "./modules/customer/customer.routes.js";
import { businessRouter } from "./modules/business/business.router.js";
import { userRoutes } from "./modules/user/user.router.js";
import { cardTemplateRouter } from "./modules/loyalty-card-template/card.template.router.js";
import { userCardRouter } from "./modules/user-loyalty-card/user.card.router.js";
import { stampingLogRouter } from "./modules/stamping-log/stamping-log.router.js";
import { subscriptionRouter } from "./modules/subscription/subscription.router.js";
import { subscriptionController } from "./modules/subscription/subscription.controller.js";
import { env } from "./config/env.js";

const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin: string) => origin.trim())
  .filter(Boolean);

export const app = express();

app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Auth-Return-Redirect"],
  })
);

app.post(
  "/subscription/webhook",
  express.raw({ type: "application/json" }),
  subscriptionController.handleWebhook
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/auth", ExpressAuth(authConfig));

app.use("/customer", customerRoutes);
app.use("/business", businessRouter);
app.use("/user", userRoutes);
app.use("/card-template", cardTemplateRouter);
app.use("/user-loyalty-card", userCardRouter);
app.use("/stamping-log", stampingLogRouter);
app.use("/subscription", subscriptionRouter);

app.use(errorMiddleware);
