import express from "express";
import cors from "cors";
import { errorMiddleware } from "./common/errors/errorMiddleware";
import { customerRoutes } from "./modules/costumer/costumer.routes";
import { businessRouter } from "./modules/business/business.router";
import { userRoutes } from "./modules/user/user.router";

export const app = express();

app.use(
  cors({
    origin: "http://172.27.128.1:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.use("/customer", customerRoutes);
app.use("/business", businessRouter);
app.use("/user", userRoutes);

app.use(errorMiddleware);
