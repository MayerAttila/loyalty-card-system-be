import { Router } from "express";
import { billingController } from "./billing.controller.js";

export const billingRouter = Router();

billingRouter.get("/status", billingController.getBillingStatus);
billingRouter.post("/checkout", billingController.createCheckoutSession);
billingRouter.post("/portal", billingController.createPortalSession);
