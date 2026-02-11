import { Router } from "express";
import { userControllers } from "./user.controller.js";
import {
  requireBodyBusinessMatch,
  requireBusinessMember,
  requireParamBusinessMatch,
  requireRoles,
  requireSession,
} from "../../common/middleware/authz.js";

export const userRoutes = Router();

userRoutes.get(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  userControllers.getUserById
);
userRoutes.get(
  "/businessId/:businessId",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  requireParamBusinessMatch("businessId"),
  userControllers.getAllUsersByBusinessId
);
userRoutes.post("/", userControllers.createUser);
userRoutes.patch(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  userControllers.updateUserProfile
);
userRoutes.post(
  "/invite",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  requireBodyBusinessMatch("businessId"),
  userControllers.sendEmployeeInvite
);
userRoutes.patch(
  "/id/:id/role",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  userControllers.updateUserRole
);
userRoutes.delete(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  userControllers.deleteUser
);
