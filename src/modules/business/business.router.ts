import { Router } from "express";
import { businessController } from "./business.conteroller.js";

export const businessRouter = Router();

businessRouter.get("/", businessController.getAllBusinesses);
businessRouter.get("/id/:id", businessController.getBusinessById);
businessRouter.post("/", businessController.createBusiness);
businessRouter.patch("/id/:id", businessController.updateBusiness);
