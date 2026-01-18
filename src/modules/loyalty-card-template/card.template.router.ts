import { Router } from "express";
import { cardTemplateController } from "./card.template.controller.js";

export const cardTemplateRouter = Router();

cardTemplateRouter.get(
  "/business/:businessId",
  cardTemplateController.getCardTemplatesByBusinessId,
);
cardTemplateRouter.get("/id/:id", cardTemplateController.getCardTemplateById);
cardTemplateRouter.post("/", cardTemplateController.createCardTemplate);
cardTemplateRouter.patch("/id/:id", cardTemplateController.updateCardTemplate);
