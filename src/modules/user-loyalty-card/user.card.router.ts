import { Router } from "express";
import { userCardControllers } from "./user.card.controller.js";

export const userCardRouter = Router();

userCardRouter.get("/id/:id", userCardControllers.getCardById);
userCardRouter.get(
  "/customer/:customerId",
  userCardControllers.getCardsByCustomerId
);
userCardRouter.post("/", userCardControllers.createCustomerCard);
userCardRouter.post(
  "/id/:id/google-wallet",
  userCardControllers.getGoogleWalletSaveLink
);
