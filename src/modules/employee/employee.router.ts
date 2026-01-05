import { Router } from "express";
import { employeeController } from "./emloyee.controller";

export const employeeRouter = Router();

employeeRouter.get("/id/:id", employeeController.getEmployeeById);
employeeRouter.get(
  "/businessId/:businessId",
  employeeController.getAllEmployeesByBusinessId
);
employeeRouter.post("/", employeeController.createEmployee);
