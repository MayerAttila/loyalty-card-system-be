import { Router } from "express";
import multer from "multer";
import { businessController } from "./business.controller.js";

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
businessRouter.delete("/id/:id/logo", businessController.deleteBusinessLogo);
businessRouter.delete(
  "/id/:id/stamps/:imageId",
  businessController.deleteBusinessStampImage
);
businessRouter.post("/", businessController.createBusiness);
businessRouter.patch("/id/:id", businessController.updateBusiness);
businessRouter.post(
  "/id/:id/logo",
  upload.single("logo"),
  businessController.uploadBusinessLogo
);
businessRouter.post(
  "/id/:id/stamp-on",
  upload.single("stampOn"),
  businessController.uploadBusinessStampOn
);
businessRouter.post(
  "/id/:id/stamp-off",
  upload.single("stampOff"),
  businessController.uploadBusinessStampOff
);
