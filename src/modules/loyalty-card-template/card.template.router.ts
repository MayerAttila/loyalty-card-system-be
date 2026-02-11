import { Router } from "express";
import { cardTemplateController } from "./card.template.controller.js";
import {
  requireBodyBusinessMatch,
  requireBusinessMember,
  requireParamBusinessMatch,
  requireRoles,
  requireSession,
} from "../../common/middleware/authz.js";

export const cardTemplateRouter = Router();

cardTemplateRouter.get(
  "/business/:businessId",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  requireParamBusinessMatch("businessId"),
  cardTemplateController.getCardTemplatesByBusinessId,
);
cardTemplateRouter.get(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  cardTemplateController.getCardTemplateById
);
cardTemplateRouter.post(
  "/",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  requireBodyBusinessMatch("businessId"),
  cardTemplateController.createCardTemplate
);
cardTemplateRouter.patch(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  cardTemplateController.updateCardTemplate
);
cardTemplateRouter.delete(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  cardTemplateController.deleteCardTemplate
);
cardTemplateRouter.post(
  "/id/:id/hero-image",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  cardTemplateController.generateTemplateHeroImage
);
