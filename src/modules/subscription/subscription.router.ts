import { Router } from "express";
import { subscriptionController } from "./subscription.controller.js";

export const subscriptionRouter = Router();

subscriptionRouter.get("/status", subscriptionController.getSubscriptionStatus);
subscriptionRouter.post("/trial", subscriptionController.startTrialNoCard);
subscriptionRouter.post("/subscribe", subscriptionController.createSubscriptionIntent);
subscriptionRouter.post("/cancel", subscriptionController.cancelSubscription);
subscriptionRouter.post("/cancel-now", subscriptionController.cancelSubscriptionNow);
subscriptionRouter.post("/reset", subscriptionController.resetSubscriptionForTesting);
subscriptionRouter.post("/checkout", subscriptionController.createCheckoutSession);
subscriptionRouter.post("/portal", subscriptionController.createPortalSession);
