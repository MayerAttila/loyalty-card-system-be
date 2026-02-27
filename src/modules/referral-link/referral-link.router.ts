import { Router } from "express";
import {
  requirePlatformAdmin,
  requireSession,
} from "../../common/middleware/authz.js";
import { referralLinkController } from "./referral-link.controller.js";

export const referralLinkRouter = Router();

referralLinkRouter.get(
  "/",
  requireSession,
  requirePlatformAdmin,
  referralLinkController.listReferralLinks
);

referralLinkRouter.post(
  "/",
  requireSession,
  requirePlatformAdmin,
  referralLinkController.createReferralLink
);

referralLinkRouter.patch(
  "/id/:id",
  requireSession,
  requirePlatformAdmin,
  referralLinkController.updateReferralLink
);

referralLinkRouter.delete(
  "/id/:id",
  requireSession,
  requirePlatformAdmin,
  referralLinkController.deleteReferralLink
);
