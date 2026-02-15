import { Router } from "express";
import { userCardControllers } from "./user.card.controller.js";
import {
  requireBusinessMember,
  requireRoles,
  requireSession,
} from "../../common/middleware/authz.js";

export const userCardRouter = Router();

userCardRouter.get(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  userCardControllers.getCardById
);
userCardRouter.get(
  "/customer/:customerId",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  userCardControllers.getCardsByCustomerId
);
userCardRouter.post(
  "/",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  userCardControllers.createCustomerCard
);
userCardRouter.post(
  "/id/:id/google-wallet",
  userCardControllers.getGoogleWalletSaveLink
);
userCardRouter.get(
  "/id/:id/apple-wallet",
  userCardControllers.getAppleWalletPass
);
userCardRouter.post(
  "/id/:id/stamp",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  userCardControllers.stampCard
);
