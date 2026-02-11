import { Router } from "express";
import { customerControllers } from "./customer.controller.js";
import {
  requireBusinessMember,
  requireParamBusinessMatch,
  requireRoles,
  requireSession,
} from "../../common/middleware/authz.js";

export const customerRoutes = Router();

customerRoutes.get(
  "/",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  customerControllers.getAllCustomer
);
customerRoutes.get(
  "/email/:email",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  customerControllers.getCustomerByEmail
);
customerRoutes.get(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  customerControllers.getCustomerById
);
customerRoutes.get(
  "/business/:businessId",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN", "STAFF"),
  requireParamBusinessMatch("businessId"),
  customerControllers.getCustomersByBusinessId
);
customerRoutes.post("/", customerControllers.createCustomer);
