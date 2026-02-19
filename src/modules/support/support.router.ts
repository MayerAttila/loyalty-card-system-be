import { Router } from "express";
import { supportController } from "./support.controller.js";

export const supportRouter = Router();

supportRouter.post("/contact", supportController.submitContact);
