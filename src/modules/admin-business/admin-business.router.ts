import { Router } from "express";
import {
  requirePlatformAdmin,
  requireSession,
} from "../../common/middleware/authz.js";
import { adminBusinessController } from "./admin-business.controller.js";

export const adminBusinessRouter = Router();

adminBusinessRouter.get(
  "/subscription-history",
  requireSession,
  requirePlatformAdmin,
  adminBusinessController.listSubscriptionHistory
);

adminBusinessRouter.get(
  "/",
  requireSession,
  requirePlatformAdmin,
  adminBusinessController.listBusinesses
);
