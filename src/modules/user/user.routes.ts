import { Router } from "express";
import { userController } from "./user.controller";

export const userRouter = Router();

userRouter.get("/", userController.getAllUsers);
userRouter.get("/email/:email", userController.getUserByEmail);
userRouter.get("/id/:id", userController.getUserById);
userRouter.post("/", userController.createUser);
