import { Router } from "express";
import { passwordResetController } from "./password-reset.controller.js";

export const passwordResetRouter = Router();

passwordResetRouter.post("/request", passwordResetController.requestPasswordReset);
passwordResetRouter.post("/confirm", passwordResetController.confirmPasswordReset);
