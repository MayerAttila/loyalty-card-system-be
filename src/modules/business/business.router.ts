import { Router } from "express";
import multer from "multer";
import { businessController } from "./business.controller.js";
import {
  requireBusinessMember,
  requireRoles,
  requireSession,
} from "../../common/middleware/authz.js";

export const businessRouter = Router();

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES },
});

businessRouter.get("/", businessController.getAllBusinesses);
businessRouter.get("/id/:id", businessController.getBusinessById);
businessRouter.get("/id/:id/logo", businessController.getBusinessLogo);
businessRouter.get("/id/:id/stamps", businessController.getBusinessStamps);
businessRouter.get("/id/:id/stamp-on", businessController.getBusinessStampOn);
businessRouter.get("/id/:id/stamp-off", businessController.getBusinessStampOff);
businessRouter.delete(
  "/id/:id/logo",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  businessController.deleteBusinessLogo
);
businessRouter.delete(
  "/id/:id/stamps/:imageId",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  businessController.deleteBusinessStampImage
);
businessRouter.post("/", businessController.createBusiness);
businessRouter.patch(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  businessController.updateBusiness
);
businessRouter.post(
  "/id/:id/logo",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  upload.single("logo"),
  businessController.uploadBusinessLogo
);
businessRouter.post(
  "/id/:id/stamp-on",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  upload.single("stampOn"),
  businessController.uploadBusinessStampOn
);
businessRouter.post(
  "/id/:id/stamp-off",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  upload.single("stampOff"),
  businessController.uploadBusinessStampOff
);
