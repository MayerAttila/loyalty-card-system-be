import { Router } from "express";
import { userCardControllers } from "./user.card.controller.js";

export const userCardRouter = Router();

userCardRouter.get("/id/:id", userCardControllers.getCardById);
userCardRouter.get(
  "/customer/:costumerId",
  userCardControllers.getCardsByCustomerId
);
userCardRouter.post("/", userCardControllers.createCustomerCard);
