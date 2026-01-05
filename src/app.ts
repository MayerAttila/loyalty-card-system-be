import express from "express";
import { errorMiddleware } from "./common/errors/errorMiddleware";
import { userRouter } from "./modules/user/user.routes";

export const app = express();

app.use(express.json());

app.use("/user", userRouter);

app.use(errorMiddleware);
