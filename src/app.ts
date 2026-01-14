import { ExpressAuth } from "@auth/express";
import express from "express";
import cors from "cors";
import { authConfig } from "./auth.js";
import { errorMiddleware } from "./common/errors/errorMiddleware.js";
import { customerRoutes } from "./modules/costumer/costumer.routes.js";
import { businessRouter } from "./modules/business/business.router.js";
import { userRoutes } from "./modules/user/user.router.js";
import { env } from "./config/env.js";

const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin: string) => origin.trim())
  .filter(Boolean);

export const app = express();

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Auth-Return-Redirect"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/auth", ExpressAuth(authConfig));

app.use("/customer", customerRoutes);
app.use("/business", businessRouter);
app.use("/user", userRoutes);

app.use(errorMiddleware);
