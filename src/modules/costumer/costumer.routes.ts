import { Router } from "express";
import { costumerControllers } from "./costumer.controller";

export const customerRoutes = Router();

customerRoutes.get("/", costumerControllers.getAllCustomer);
customerRoutes.get("/email/:email", costumerControllers.getCustomerByEmail);
customerRoutes.get("/id/:id", costumerControllers.getCustomerById);
customerRoutes.post("/", costumerControllers.createCustomer);
