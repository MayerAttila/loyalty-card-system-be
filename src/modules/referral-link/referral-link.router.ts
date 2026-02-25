import { Router } from "express";
import {
  requireBusinessMember,
  requireRoles,
  requireSession,
} from "../../common/middleware/authz.js";
import { referralLinkController } from "./referral-link.controller.js";

export const referralLinkRouter = Router();

referralLinkRouter.get(
  "/",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  referralLinkController.listReferralLinks
);

referralLinkRouter.post(
  "/",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  referralLinkController.createReferralLink
);

referralLinkRouter.patch(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  referralLinkController.updateReferralLink
);

referralLinkRouter.delete(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  referralLinkController.deleteReferralLink
);
