import { Router } from "express";
import { customerControllers } from "./customer.controller.js";

export const customerRoutes = Router();

customerRoutes.get("/", customerControllers.getAllCustomer);
customerRoutes.get("/email/:email", customerControllers.getCustomerByEmail);
customerRoutes.get("/id/:id", customerControllers.getCustomerById);
customerRoutes.post("/", customerControllers.createCustomer);
