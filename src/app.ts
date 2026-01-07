import express from "express";
import cors from "cors";
import { errorMiddleware } from "./common/errors/errorMiddleware";
import { userRouter } from "./modules/user/user.routes";
import { businessRouter } from "./modules/business/business.router";
import { employeeRouter } from "./modules/employee/employee.router";

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

app.use("/user", userRouter);
app.use("/business", businessRouter);
app.use("/employee", employeeRouter);

app.use(errorMiddleware);
