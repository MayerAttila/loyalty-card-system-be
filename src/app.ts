import express from "express";
import { errorMiddleware } from "./common/errors/errorMiddleware";
import { userRouter } from "./modules/user/user.routes";
import { businessRouter } from "./modules/business/business.router";
import { employeeRouter } from "./modules/employee/employee.router";

export const app = express();

app.use(express.json());

app.use("/user", userRouter);
app.use("/business", businessRouter);
app.use("/employee", employeeRouter);

app.use(errorMiddleware);
