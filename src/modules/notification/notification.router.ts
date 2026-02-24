import { Router } from "express";
import {
  requireBodyBusinessMatch,
  requireBusinessMember,
  requireParamBusinessMatch,
  requireRoles,
  requireSession,
} from "../../common/middleware/authz.js";
import { notificationController } from "./notification.controller.js";

export const notificationRouter = Router();

notificationRouter.post(
  "/",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  requireBodyBusinessMatch("businessId"),
  notificationController.createNotification
);

notificationRouter.get(
  "/business/:businessId",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  requireParamBusinessMatch("businessId"),
  notificationController.listNotificationsByBusiness
);

notificationRouter.get(
  "/logs/business",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  notificationController.listNotificationLogsByBusiness
);

notificationRouter.get(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  notificationController.getNotificationById
);

notificationRouter.patch(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  notificationController.updateNotification
);

notificationRouter.patch(
  "/id/:id/status",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  notificationController.updateNotificationStatus
);

notificationRouter.post(
  "/id/:id/send-now",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  notificationController.sendNotificationNow
);

notificationRouter.delete(
  "/id/:id",
  requireSession,
  requireBusinessMember,
  requireRoles("OWNER", "ADMIN"),
  notificationController.deleteNotification
);
