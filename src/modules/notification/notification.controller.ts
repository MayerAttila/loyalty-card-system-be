import type { Request, Response } from "express";
import {
  NotificationDeliveryMode,
  NotificationRepeatPattern,
  NotificationScheduleType,
  NotificationStatus,
  NotificationWeekday,
  type Notification,
} from "@prisma/client";
import { prisma } from "../../prisma/client.js";

const MAX_TITLE_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 500;
const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type BodyRecord = Record<string, unknown>;

type NotificationWriteInput = {
  title: string;
  message: string;
  status: NotificationStatus;
  deliveryMode: NotificationDeliveryMode;
  scheduleType: NotificationScheduleType;
  scheduledAtUtc: Date | null;
  repeatDays: NotificationWeekday[];
  repeatPattern: NotificationRepeatPattern | null;
  monthlyDayOfMonth: number | null;
  repeatTimeLocal: string | null;
  timezone: string;
  nextRunAtUtc: Date | null;
};

const hasOwn = (obj: BodyRecord, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeOptionalString = (value: unknown) => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

function ensureValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function parseDeliveryMode(value: unknown): NotificationDeliveryMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "NOW") return NotificationDeliveryMode.NOW;
  if (normalized === "SCHEDULED") return NotificationDeliveryMode.SCHEDULED;
  return null;
}

function parseScheduleType(value: unknown): NotificationScheduleType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "ONCE") return NotificationScheduleType.ONCE;
  if (normalized === "REPEAT") return NotificationScheduleType.REPEAT;
  return null;
}

function parseNotificationStatus(value: unknown): NotificationStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "ACTIVE") return NotificationStatus.ACTIVE;
  if (normalized === "INACTIVE") return NotificationStatus.INACTIVE;
  return null;
}

function parseNotificationWeekdays(value: unknown): NotificationWeekday[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: NotificationWeekday[] = [];

  for (const item of value) {
    if (typeof item !== "string") return null;
    const normalized = item.trim().toUpperCase();
    if (!(normalized in NotificationWeekday)) {
      return null;
    }
    const weekday = NotificationWeekday[
      normalized as keyof typeof NotificationWeekday
    ];
    if (!parsed.includes(weekday)) {
      parsed.push(weekday);
    }
  }

  return parsed;
}

function parseNotificationRepeatPattern(
  value: unknown
): NotificationRepeatPattern | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "WEEKLY") return NotificationRepeatPattern.WEEKLY;
  if (normalized === "BIWEEKLY") return NotificationRepeatPattern.BIWEEKLY;
  if (normalized === "MONTHLY") return NotificationRepeatPattern.MONTHLY;
  return null;
}

function parseMonthlyDayOfMonth(value: unknown): number | null | undefined {
  if (typeof value === "undefined") return undefined;
  if (value === null) return null;
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isInteger(numeric)) return null;
  if (numeric < 1 || numeric > 31) return null;
  return numeric;
}

function parseDateFromIsoString(value: unknown): Date | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseScheduledAtFallbackFromDateAndTime(body: BodyRecord) {
  const dateValue = normalizeOptionalString(body.scheduledDate);
  const timeValue = normalizeOptionalString(body.scheduledTime);

  if (!dateValue && !timeValue) return undefined;
  if (!dateValue || !timeValue) return null;
  if (!ISO_DATE_REGEX.test(dateValue)) return null;
  if (!TIME_HH_MM_REGEX.test(timeValue)) return null;

  // Fallback only: interprets provided date+time as UTC wall-clock.
  const parsed = new Date(`${dateValue}T${timeValue}:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function buildNotificationWriteInput(body: BodyRecord): NotificationWriteInput {
  const title = normalizeString(body.title);
  if (!title || title.length > MAX_TITLE_LENGTH) {
    throw new Error("Notification title is required.");
  }

  const message = normalizeString(body.message);
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    throw new Error("Notification message is required.");
  }

  const deliveryMode = parseDeliveryMode(body.deliveryMode);
  if (!deliveryMode) {
    throw new Error("Invalid delivery mode.");
  }

  const parsedStatus = hasOwn(body, "status")
    ? parseNotificationStatus(body.status)
    : NotificationStatus.ACTIVE;
  if (!parsedStatus) {
    throw new Error("Invalid notification status.");
  }

  const timezone =
    normalizeOptionalString(body.timezone) ??
    (typeof body.timezone === "undefined" ? "UTC" : null);
  if (!timezone || !ensureValidTimezone(timezone)) {
    throw new Error("Invalid timezone.");
  }

  let scheduleType = parseScheduleType(body.scheduleType);
  if (deliveryMode === NotificationDeliveryMode.NOW) {
    scheduleType = NotificationScheduleType.ONCE;
  } else if (!scheduleType) {
    throw new Error("Invalid schedule type.");
  }

  const scheduledAtUtcFromBody = hasOwn(body, "scheduledAtUtc")
    ? parseDateFromIsoString(body.scheduledAtUtc)
    : undefined;
  if (hasOwn(body, "scheduledAtUtc") && typeof scheduledAtUtcFromBody === "undefined") {
    throw new Error("Invalid scheduledAtUtc value.");
  }

  const scheduledAtFallback = parseScheduledAtFallbackFromDateAndTime(body);
  if (scheduledAtFallback === null) {
    throw new Error("Invalid scheduled date/time.");
  }

  const repeatDaysRaw = hasOwn(body, "repeatDays")
    ? parseNotificationWeekdays(body.repeatDays)
    : [];
  if (repeatDaysRaw === null) {
    throw new Error("Invalid repeat days.");
  }

  const repeatPatternRaw = hasOwn(body, "repeatPattern")
    ? parseNotificationRepeatPattern(body.repeatPattern)
    : NotificationRepeatPattern.WEEKLY;
  if (
    !repeatPatternRaw &&
    deliveryMode === NotificationDeliveryMode.SCHEDULED &&
    scheduleType === NotificationScheduleType.REPEAT
  ) {
    throw new Error("Invalid repeat pattern.");
  }

  const monthlyDayRaw = parseMonthlyDayOfMonth(body.monthlyDayOfMonth);
  if (monthlyDayRaw === null && hasOwn(body, "monthlyDayOfMonth")) {
    throw new Error("Invalid monthly day.");
  }

  const repeatTimeLocalParsed = hasOwn(body, "repeatTimeLocal")
    ? normalizeOptionalString(body.repeatTimeLocal)
    : normalizeOptionalString(body.scheduledTime);
  if (repeatTimeLocalParsed && !TIME_HH_MM_REGEX.test(repeatTimeLocalParsed)) {
    throw new Error("Invalid repeat time.");
  }

  let scheduledAtUtc: Date | null = null;
  let repeatDays: NotificationWeekday[] = [];
  let repeatPattern: NotificationRepeatPattern | null = null;
  let monthlyDayOfMonth: number | null = null;
  let repeatTimeLocal: string | null = null;
  let nextRunAtUtc: Date | null = null;

  if (deliveryMode === NotificationDeliveryMode.SCHEDULED) {
    if (scheduleType === NotificationScheduleType.ONCE) {
      scheduledAtUtc = scheduledAtUtcFromBody ?? scheduledAtFallback ?? null;
      if (!scheduledAtUtc) {
        throw new Error("Scheduled date/time is required.");
      }
      nextRunAtUtc = scheduledAtUtc;
    } else {
      repeatPattern = repeatPatternRaw ?? NotificationRepeatPattern.WEEKLY;
      repeatTimeLocal = repeatTimeLocalParsed ?? null;
      if (!repeatTimeLocal) {
        throw new Error("Repeat time is required.");
      }
      if (repeatPattern === NotificationRepeatPattern.MONTHLY) {
        monthlyDayOfMonth = monthlyDayRaw ?? null;
        if (!monthlyDayOfMonth) {
          throw new Error("Monthly day is required.");
        }
        repeatDays = [];
      } else {
        repeatDays = repeatDaysRaw;
        if (repeatDays.length === 0) {
          throw new Error("At least one repeat day is required.");
        }
        monthlyDayOfMonth = null;
      }
      // Recurring next-run calculation will be handled by the scheduler worker.
      nextRunAtUtc = null;
    }
  }

  return {
    title,
    message,
    status: parsedStatus,
    deliveryMode,
    scheduleType,
    scheduledAtUtc,
    repeatDays,
    repeatPattern,
    monthlyDayOfMonth,
    repeatTimeLocal,
    timezone,
    nextRunAtUtc,
  };
}

type NotificationWithMeta = Notification & {
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  _count: {
    logs: number;
  };
};

function serializeNotification(notification: NotificationWithMeta) {
  return {
    id: notification.id,
    businessId: notification.businessId,
    createdById: notification.createdById,
    createdBy: notification.createdBy,
    title: notification.title,
    message: notification.message,
    status: notification.status.toLowerCase(),
    deliveryMode: notification.deliveryMode.toLowerCase(),
    scheduleType: notification.scheduleType.toLowerCase(),
    scheduledAtUtc: notification.scheduledAtUtc,
    repeatDays: notification.repeatDays.map((day) => day.toLowerCase()),
    repeatPattern: notification.repeatPattern?.toLowerCase() ?? null,
    monthlyDayOfMonth: notification.monthlyDayOfMonth ?? null,
    repeatTimeLocal: notification.repeatTimeLocal,
    timezone: notification.timezone,
    nextRunAtUtc: notification.nextRunAtUtc,
    lastRunAtUtc: notification.lastRunAtUtc,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
    logCount: notification._count.logs,
  };
}

async function requireScopedNotification(id: string, businessId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      _count: {
        select: { logs: true },
      },
    },
  });

  if (!notification) {
    return { error: { status: 404, message: "notification not found" } } as const;
  }

  if (notification.businessId !== businessId) {
    return { error: { status: 403, message: "forbidden business access" } } as const;
  }

  return { notification } as const;
}

async function createNotification(req: Request, res: Response) {
  const authUser = req.authUser;
  if (!authUser?.id || !authUser.businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const body = (req.body ?? {}) as BodyRecord;

  try {
    const input = buildNotificationWriteInput(body);

    const created = await prisma.notification.create({
      data: {
        businessId: authUser.businessId,
        createdById: authUser.id,
        ...input,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { logs: true },
        },
      },
    });

    return res.status(201).json(serializeNotification(created));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create notification.";
    return res.status(400).json({ message });
  }
}

async function listNotificationsByBusiness(req: Request, res: Response) {
  const businessId = req.authUser?.businessId;
  if (!businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const statusFilter = hasOwn(req.query as Record<string, unknown>, "status")
    ? parseNotificationStatus(req.query.status)
    : null;

  if ((req.query as Record<string, unknown>).status && !statusFilter) {
    return res.status(400).json({ message: "invalid status filter" });
  }

  const notifications = await prisma.notification.findMany({
    where: {
      businessId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { logs: true },
      },
    },
  });

  return res.json(notifications.map(serializeNotification));
}

async function getNotificationById(req: Request, res: Response) {
  const businessId = req.authUser?.businessId;
  if (!businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const scoped = await requireScopedNotification(req.params.id, businessId);
  if ("error" in scoped && scoped.error) {
    return res.status(scoped.error.status).json({ message: scoped.error.message });
  }

  return res.json(serializeNotification(scoped.notification));
}

async function updateNotification(req: Request, res: Response) {
  const authUser = req.authUser;
  if (!authUser?.businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const scoped = await requireScopedNotification(req.params.id, authUser.businessId);
  if ("error" in scoped && scoped.error) {
    return res.status(scoped.error.status).json({ message: scoped.error.message });
  }

  const existing = scoped.notification;
  const body = (req.body ?? {}) as BodyRecord;

  const mergedPayload: BodyRecord = {
    title: existing.title,
    message: existing.message,
    status: existing.status,
    deliveryMode: existing.deliveryMode,
    scheduleType: existing.scheduleType,
    scheduledAtUtc: existing.scheduledAtUtc?.toISOString() ?? null,
    repeatDays: existing.repeatDays,
    repeatPattern: existing.repeatPattern ?? NotificationRepeatPattern.WEEKLY,
    monthlyDayOfMonth: existing.monthlyDayOfMonth,
    repeatTimeLocal: existing.repeatTimeLocal,
    timezone: existing.timezone,
    ...body,
  };

  // Prevent cross-business reassignment through generic PATCH bodies.
  delete mergedPayload.businessId;
  delete mergedPayload.createdById;

  try {
    const input = buildNotificationWriteInput(mergedPayload);

    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: input,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { logs: true },
        },
      },
    });

    return res.json(serializeNotification(updated));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update notification.";
    return res.status(400).json({ message });
  }
}

async function updateNotificationStatus(req: Request, res: Response) {
  const businessId = req.authUser?.businessId;
  if (!businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const scoped = await requireScopedNotification(req.params.id, businessId);
  if ("error" in scoped && scoped.error) {
    return res.status(scoped.error.status).json({ message: scoped.error.message });
  }

  const requestedStatus = hasOwn((req.body ?? {}) as BodyRecord, "status")
    ? parseNotificationStatus((req.body as BodyRecord).status)
    : null;

  if ((req.body as BodyRecord | undefined)?.status && !requestedStatus) {
    return res.status(400).json({ message: "invalid notification status" });
  }

  const nextStatus =
    requestedStatus ??
    (scoped.notification.status === NotificationStatus.ACTIVE
      ? NotificationStatus.INACTIVE
      : NotificationStatus.ACTIVE);

  const updated = await prisma.notification.update({
    where: { id: scoped.notification.id },
    data: { status: nextStatus },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { logs: true },
      },
    },
  });

  return res.json(serializeNotification(updated));
}

async function deleteNotification(req: Request, res: Response) {
  const businessId = req.authUser?.businessId;
  if (!businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const scoped = await requireScopedNotification(req.params.id, businessId);
  if ("error" in scoped && scoped.error) {
    return res.status(scoped.error.status).json({ message: scoped.error.message });
  }

  await prisma.notification.delete({
    where: { id: scoped.notification.id },
  });

  return res.status(200).json({ id: scoped.notification.id, deleted: true });
}

export const notificationController = {
  createNotification,
  listNotificationsByBusiness,
  getNotificationById,
  updateNotification,
  updateNotificationStatus,
  deleteNotification,
};
