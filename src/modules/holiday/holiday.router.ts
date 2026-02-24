import { Router } from "express";
import {
  requireBusinessMember,
  requireRoles,
  requireSession,
} from "../../common/middleware/authz.js";
import { holidayController } from "./holiday.controller.js";

export const holidayRouter = Router();

holidayRouter.get(
  "/public",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  holidayController.getPublicHolidays
);

