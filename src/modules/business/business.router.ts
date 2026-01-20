import { Router } from "express";
import multer from "multer";
import { businessController } from "./business.conteroller.js";

export const businessRouter = Router();

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES },
});

businessRouter.get("/", businessController.getAllBusinesses);
businessRouter.get("/id/:id", businessController.getBusinessById);
businessRouter.get("/id/:id/logo", businessController.getBusinessLogo);
businessRouter.get("/id/:id/stamp-on", businessController.getBusinessStampOn);
businessRouter.get("/id/:id/stamp-off", businessController.getBusinessStampOff);
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
