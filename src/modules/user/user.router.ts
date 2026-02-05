import { Router } from "express";
import { userControllers } from "./user.controller.js";

export const userRoutes = Router();

userRoutes.get("/id/:id", userControllers.getUserById);
userRoutes.get(
  "/businessId/:businessId",
  userControllers.getAllUsersByBusinessId
);
userRoutes.post("/", userControllers.createUser);
userRoutes.patch("/id/:id", userControllers.updateUserProfile);
userRoutes.post("/invite", userControllers.sendEmployeeInvite);
userRoutes.patch("/id/:id/role", userControllers.updateUserRole);
userRoutes.delete("/id/:id", userControllers.deleteUser);
