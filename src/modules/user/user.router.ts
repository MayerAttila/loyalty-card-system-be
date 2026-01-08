import { Router } from "express";
import { userControllers } from "./user.controller";

export const userRoutes = Router();

userRoutes.get("/id/:id", userControllers.getUserById);
userRoutes.get(
  "/businessId/:businessId",
  userControllers.getAllUsersByBusinessId
);
userRoutes.post("/", userControllers.createUser);
