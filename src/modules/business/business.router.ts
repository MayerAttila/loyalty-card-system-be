import { Router } from "express";
import { businessController } from "./business.conteroller";

export const businessRouter = Router();

businessRouter.get("/", businessController.getAllBusinesses);
businessRouter.get("/id/:id", businessController.getBusinessById);
businessRouter.post("/", businessController.createBusiness);
