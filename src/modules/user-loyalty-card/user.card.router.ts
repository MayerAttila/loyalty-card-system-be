import { Router } from "express";
import { userCardControllers } from "./user.card.controller.js";
import {
  requireBusinessMember,
  requireRoles,
  requireSession,
} from "../../common/middleware/authz.js";

export const userCardRouter = Router();

userCardRouter.post(
  "/apple-wallet/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber",
  userCardControllers.registerAppleWalletPass
);
userCardRouter.delete(
  "/apple-wallet/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber",
  userCardControllers.unregisterAppleWalletPass
);
userCardRouter.get(
  "/apple-wallet/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier",
  userCardControllers.listAppleWalletPassesForDevice
);
userCardRouter.get(
  "/apple-wallet/v1/passes/:passTypeIdentifier/:serialNumber",
  userCardControllers.getAppleWalletPassBySerial
);
userCardRouter.post("/apple-wallet/v1/log", userCardControllers.appleWalletLog);

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
