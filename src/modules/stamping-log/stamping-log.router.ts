import { Router } from "express";
import { stampingLogControllers } from "./stamping-log.controller.js";

export const stampingLogRouter = Router();

stampingLogRouter.get("/business", stampingLogControllers.getStampingLogsForBusiness);
