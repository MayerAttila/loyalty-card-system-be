import { Router } from "express";
import { billingController } from "./billing.controller.js";

export const billingRouter = Router();

billingRouter.get("/status", billingController.getBillingStatus);
billingRouter.post("/trial", billingController.startTrialNoCard);
billingRouter.post("/subscribe", billingController.createSubscriptionIntent);
billingRouter.post("/cancel", billingController.cancelSubscription);
billingRouter.post("/cancel-now", billingController.cancelSubscriptionNow);
billingRouter.post("/reset", billingController.resetSubscriptionForTesting);
billingRouter.post("/checkout", billingController.createCheckoutSession);
billingRouter.post("/portal", billingController.createPortalSession);
