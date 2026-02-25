import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import {
  NotificationChannel,
  NotificationDeliveryMode,
  NotificationLogStatus,
  NotificationRepeatPattern,
  NotificationScheduleType,
  NotificationStatus,
  NotificationTriggerType,
  NotificationWeekday,
  type Notification,
} from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { notifyAppleWalletPassUpdated } from "../../lib/appleWalletUpdateFlow.js";
import { walletRequest } from "../../lib/googleWallet.js";
import { getStampHeroImageUrl } from "../../lib/stampHeroImage.js";
import {
  buildStampImageModule,
  buildStampTextModules,
} from "../../lib/walletPassStructure.js";

const MAX_TITLE_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 500;
const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type BodyRecord = Record<string, unknown>;

type NotificationWriteInput = {
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

function deriveNotificationTitle(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "Notification";
  if (normalized.length <= MAX_TITLE_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

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

type LocalDateParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
};

type LocalTimeParts = {
  hour: number;
  minute: number;
};

type ZonedDateTimeParts = LocalDateParts &
  LocalTimeParts & {
    second: number;
  };

type RecurringScheduleLike = {
  repeatPattern: NotificationRepeatPattern;
  repeatDays: NotificationWeekday[];
  monthlyDayOfMonth: number | null;
  repeatTimeLocal: string;
  timezone: string;
  createdAt?: Date | null;
};

const WEEKDAY_TO_JS_DAY: Record<NotificationWeekday, number> = {
  [NotificationWeekday.SUN]: 0,
  [NotificationWeekday.MON]: 1,
  [NotificationWeekday.TUE]: 2,
  [NotificationWeekday.WED]: 3,
  [NotificationWeekday.THU]: 4,
  [NotificationWeekday.FRI]: 5,
  [NotificationWeekday.SAT]: 6,
};

const zonedDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getZonedDateTimeFormatter(timezone: string) {
  const cached = zonedDateTimeFormatterCache.get(timezone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  zonedDateTimeFormatterCache.set(timezone, formatter);
  return formatter;
}

function getZonedDateTimeParts(date: Date, timezone: string): ZonedDateTimeParts {
  const parts = getZonedDateTimeFormatter(timezone).formatToParts(date);
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of parts) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number.parseInt(part.value, 10);
    }
  }

  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function getTimeZoneOffsetMs(date: Date, timezone: string) {
  const parts = getZonedDateTimeParts(date, timezone);
  const utcEquivalent = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
  return utcEquivalent - date.getTime();
}

function zonedLocalDateTimeToUtc(
  dateParts: LocalDateParts,
  timeParts: LocalTimeParts,
  timezone: string,
) {
  const utcGuessMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    0,
    0,
  );
  const firstGuess = new Date(utcGuessMs);
  const offsetMs = getTimeZoneOffsetMs(firstGuess, timezone);
  let result = new Date(utcGuessMs - offsetMs);

  // Re-evaluate once to handle DST transitions near the target time.
  const correctedOffsetMs = getTimeZoneOffsetMs(result, timezone);
  if (correctedOffsetMs !== offsetMs) {
    result = new Date(utcGuessMs - correctedOffsetMs);
  }

  return result;
}

function parseLocalTime(timeValue: string): LocalTimeParts | null {
  if (!TIME_HH_MM_REGEX.test(timeValue)) return null;
  const [hour, minute] = timeValue.split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return { hour, minute };
}

function localDateToEpochDay(parts: LocalDateParts) {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

function epochDayToLocalDate(epochDay: number): LocalDateParts {
  const date = new Date(epochDay * 86_400_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsToLocalDate(
  year: number,
  month: number,
  monthOffset: number,
): { year: number; month: number } {
  const zeroBased = (month - 1) + monthOffset;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return { year: targetYear, month: targetMonth };
}

function computeNextRecurringRunAtUtc(
  schedule: RecurringScheduleLike,
  afterUtc: Date,
): Date | null {
  const timeParts = parseLocalTime(schedule.repeatTimeLocal);
  if (!timeParts) return null;

  const timezone = schedule.timezone;

  if (schedule.repeatPattern === NotificationRepeatPattern.MONTHLY) {
    const startLocal = getZonedDateTimeParts(afterUtc, timezone);
    const targetDay = Math.max(1, Math.min(31, schedule.monthlyDayOfMonth ?? 1));

    for (let monthOffset = 0; monthOffset < 36; monthOffset += 1) {
      const targetMonth = addMonthsToLocalDate(
        startLocal.year,
        startLocal.month,
        monthOffset,
      );
      const day = Math.min(targetDay, getDaysInMonth(targetMonth.year, targetMonth.month));
      const candidate = zonedLocalDateTimeToUtc(
        { year: targetMonth.year, month: targetMonth.month, day },
        timeParts,
        timezone,
      );
      if (candidate.getTime() > afterUtc.getTime()) {
        return candidate;
      }
    }
    return null;
  }

  const selectedWeekdays = new Set<number>(
    schedule.repeatDays.map((day) => WEEKDAY_TO_JS_DAY[day]),
  );
  if (selectedWeekdays.size === 0) {
    return null;
  }

  const startLocalDate = getZonedDateTimeParts(afterUtc, timezone);
  const startEpochDay = localDateToEpochDay(startLocalDate);
  const anchorLocal = getZonedDateTimeParts(schedule.createdAt ?? afterUtc, timezone);
  const anchorEpochDay = localDateToEpochDay(anchorLocal);

  for (let offset = 0; offset < 400; offset += 1) {
    const epochDay = startEpochDay + offset;
    const localDate = epochDayToLocalDate(epochDay);
    const jsWeekday = new Date(
      Date.UTC(localDate.year, localDate.month - 1, localDate.day),
    ).getUTCDay();

    if (!selectedWeekdays.has(jsWeekday)) {
      continue;
    }

    if (schedule.repeatPattern === NotificationRepeatPattern.BIWEEKLY) {
      const weekDelta = Math.floor((epochDay - anchorEpochDay) / 7);
      if (weekDelta % 2 !== 0) {
        continue;
      }
    }

    const candidate = zonedLocalDateTimeToUtc(localDate, timeParts, timezone);
    if (candidate.getTime() > afterUtc.getTime()) {
      return candidate;
    }
  }

  return null;
}

function buildNotificationWriteInput(body: BodyRecord): NotificationWriteInput {
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
  if (
    monthlyDayRaw === null &&
    hasOwn(body, "monthlyDayOfMonth") &&
    body.monthlyDayOfMonth !== null
  ) {
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
      nextRunAtUtc = computeNextRecurringRunAtUtc(
        {
          repeatPattern,
          repeatDays,
          monthlyDayOfMonth,
          repeatTimeLocal,
          timezone,
        },
        new Date(),
      );
      if (!nextRunAtUtc) {
        throw new Error("Unable to compute next scheduled run.");
      }
    }
  }

  return {
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

type NotificationLogWithMeta = {
  id: string;
  notificationId: string;
  businessId: string;
  customerLoyaltyCardId: string;
  executionId: string;
  triggerType: NotificationTriggerType;
  channel: NotificationChannel;
  status: NotificationLogStatus;
  scheduledForUtc: Date | null;
  attemptedAt: Date | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  notification: {
    id: string;
    message: string;
  };
  customerLoyaltyCard: {
    id: string;
    customer: {
      id: string;
      name: string;
      email: string;
    };
    template: {
      id: string;
      template: string;
      maxPoints: number;
    };
  };
};

type CardDeliveryTarget = {
  id: string;
  googleWalletObjectId: string | null;
  customer: {
    email: string;
  };
  template: {
    id: string;
    maxPoints: number;
  };
  customerLoyaltyCardCycles: Array<{
    stampCount: number;
    cycleNumber: number;
  }>;
  appleWalletRegistrations: Array<{
    passTypeIdentifier: string;
  }>;
};

function serializeNotification(notification: NotificationWithMeta) {
  return {
    id: notification.id,
    businessId: notification.businessId,
    createdById: notification.createdById,
    createdBy: notification.createdBy,
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

function serializeNotificationLog(log: NotificationLogWithMeta) {
  return {
    id: log.id,
    notificationId: log.notificationId,
    businessId: log.businessId,
    customerLoyaltyCardId: log.customerLoyaltyCardId,
    executionId: log.executionId,
    triggerType: log.triggerType.toLowerCase(),
    channel: log.channel.toLowerCase(),
    status: log.status.toLowerCase(),
    scheduledForUtc: log.scheduledForUtc,
    attemptedAt: log.attemptedAt,
    providerMessageId: log.providerMessageId,
    errorCode: log.errorCode,
    errorMessage: log.errorMessage,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
    notification: {
      id: log.notification.id,
      message: log.notification.message,
    },
    customerLoyaltyCard: {
      id: log.customerLoyaltyCard.id,
      customer: log.customerLoyaltyCard.customer,
      template: log.customerLoyaltyCard.template,
    },
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

async function listNotificationLogsByBusiness(req: Request, res: Response) {
  const businessId = req.authUser?.businessId;
  if (!businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const hasLimitQuery = req.query.limit !== undefined;
  const limitRaw = Number.parseInt(String(req.query.limit ?? ""), 10);
  const limit =
    hasLimitQuery && Number.isInteger(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, 1000)
      : undefined;
  const offsetRaw = Number.parseInt(String(req.query.offset ?? ""), 10);
  const skip = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : undefined;

  const logs = await prisma.notificationLog.findMany({
    where: { businessId },
    ...(skip ? { skip } : {}),
    orderBy: [{ createdAt: "desc" }],
    ...(limit ? { take: limit } : {}),
    include: {
      notification: {
        select: {
          id: true,
          message: true,
        },
      },
      customerLoyaltyCard: {
        select: {
          id: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          template: {
            select: {
              id: true,
              template: true,
              maxPoints: true,
            },
          },
        },
      },
    },
  });

  return res.json(logs.map((log) => serializeNotificationLog(log as NotificationLogWithMeta)));
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

const trimTo = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

function parseApnsFailure(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  const match = message.match(/APNs push failed \((\d+)\):\s*(.*)$/s);
  if (!match) {
    return { errorCode: null as string | null, errorMessage: trimTo(message, 500) };
  }
  const statusCode = match[1] ?? "";
  const rawBody = (match[2] ?? "").trim();
  let reason = rawBody;
  try {
    const parsed = JSON.parse(rawBody) as { reason?: unknown };
    if (typeof parsed.reason === "string" && parsed.reason.trim()) {
      reason = parsed.reason.trim();
    }
  } catch {
    // Keep raw response body if not JSON.
  }

  return {
    errorCode: statusCode || null,
    errorMessage: trimTo(reason || message, 500),
  };
}

function parseGoogleWalletFailure(status: number, details: string) {
  let message = details.trim();
  try {
    const parsed = JSON.parse(details) as {
      error?: { message?: unknown };
    };
    if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) {
      message = parsed.error.message.trim();
    }
  } catch {
    // Keep raw details.
  }

  return {
    errorCode: status > 0 ? String(status) : null,
    errorMessage: trimTo(message || `Google Wallet update failed (${status})`, 500),
  };
}

async function createNotificationLog(params: {
  notificationId: string;
  businessId: string;
  customerLoyaltyCardId: string;
  executionId: string;
  triggerType: NotificationTriggerType;
  channel: NotificationChannel;
  scheduledForUtc: Date | null;
}) {
  return prisma.notificationLog.create({
    data: {
      notificationId: params.notificationId,
      businessId: params.businessId,
      customerLoyaltyCardId: params.customerLoyaltyCardId,
      executionId: params.executionId,
      triggerType: params.triggerType,
      channel: params.channel,
      status: NotificationLogStatus.QUEUED,
      scheduledForUtc: params.scheduledForUtc,
    },
  });
}

async function markNotificationLogResult(params: {
  logId: string;
  status: NotificationLogStatus;
  attemptedAt: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
  providerMessageId?: string | null;
}) {
  await prisma.notificationLog.update({
    where: { id: params.logId },
    data: {
      status: params.status,
      attemptedAt: params.attemptedAt,
      providerMessageId: params.providerMessageId ?? null,
      errorCode: params.errorCode ?? null,
      errorMessage: params.errorMessage ?? null,
    },
  });
}

async function sendGoogleWalletNotificationForCard(params: {
  notification: Notification;
  card: CardDeliveryTarget;
  executionId: string;
}) {
  if (!params.card.googleWalletObjectId) {
    return {
      status: NotificationLogStatus.SKIPPED,
      errorCode: "NO_GOOGLE_OBJECT",
      errorMessage: "Google Wallet object not found for card.",
    } as const;
  }

  const latestCycle = params.card.customerLoyaltyCardCycles[0];
  const stampCount = latestCycle?.stampCount ?? 0;
  const cycleNumber = latestCycle?.cycleNumber ?? 1;
  const rewardsEarned = Math.max(cycleNumber - 1, 0);
  const maxPoints = params.card.template.maxPoints;
  const heroImageUrl = getStampHeroImageUrl(params.card.template.id, stampCount);

  const updateRes = await walletRequest(
    `/loyaltyObject/${encodeURIComponent(
      params.card.googleWalletObjectId
    )}?updateMask=loyaltyPoints,imageModulesData,textModulesData`,
    {
      method: "PATCH",
      body: {
        loyaltyPoints: {
          label: "Stamps",
          balance: {
            string: `${stampCount}/${maxPoints}`,
          },
        },
        imageModulesData: [buildStampImageModule(heroImageUrl)],
        textModulesData: [
          ...buildStampTextModules({
            stampCount,
            maxPoints,
            rewards: rewardsEarned,
            customerEmail: params.card.customer.email,
          }),
          {
            id: "notification",
            header: trimTo(deriveNotificationTitle(params.notification.message), 40),
            body: trimTo(params.notification.message, 240),
          },
        ],
      },
    }
  );

  if (updateRes.ok) {
    const messageId = trimTo(
      `notif-${params.notification.id}-${params.executionId}`,
      100,
    );
    const addMessageRes = await walletRequest(
      `/loyaltyObject/${encodeURIComponent(
        params.card.googleWalletObjectId,
      )}/addMessage`,
      {
        method: "POST",
        body: {
          message: {
            id: messageId,
            header: trimTo(deriveNotificationTitle(params.notification.message), 40),
            body: trimTo(params.notification.message, 240),
            messageType: "TEXT_AND_NOTIFY",
          },
        },
      },
    );

    if (addMessageRes.ok) {
      return {
        status: NotificationLogStatus.SENT,
        providerMessageId: `${params.card.googleWalletObjectId}:${messageId}`,
      } as const;
    }

    const addMessageDetails = await addMessageRes.text();
    const parsedAddMessageError = parseGoogleWalletFailure(
      addMessageRes.status,
      addMessageDetails,
    );
    return {
      status: NotificationLogStatus.FAILED,
      ...parsedAddMessageError,
    } as const;
  }

  const details = await updateRes.text();
  const parsed = parseGoogleWalletFailure(updateRes.status, details);
  return {
    status: NotificationLogStatus.FAILED,
    ...parsed,
  } as const;
}

async function sendAppleWalletNotificationForCard(params: {
  card: CardDeliveryTarget;
}) {
  const passTypeIdentifier = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim() ?? "";
  if (!passTypeIdentifier) {
    return {
      status: NotificationLogStatus.SKIPPED,
      errorCode: "APPLE_PASS_TYPE_NOT_CONFIGURED",
      errorMessage: "Apple Wallet pass type identifier is not configured.",
    } as const;
  }

  if (params.card.appleWalletRegistrations.length === 0) {
    return {
      status: NotificationLogStatus.SKIPPED,
      errorCode: "NO_APPLE_REGISTRATION",
      errorMessage: "No Apple Wallet registrations found for card.",
    } as const;
  }

  try {
    await notifyAppleWalletPassUpdated({
      passTypeIdentifier,
      serialNumber: params.card.id,
      cardId: params.card.id,
    });
    return {
      status: NotificationLogStatus.SENT,
      providerMessageId: params.card.id,
    } as const;
  } catch (error) {
    return {
      status: NotificationLogStatus.FAILED,
      ...parseApnsFailure(error),
    } as const;
  }
}

type NotificationDispatchResult = {
  notificationId: string;
  executionId: string;
  triggerType: NotificationTriggerType;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  targetCardCount: number;
  attemptedAt: Date;
};

async function executeNotificationDispatch(params: {
  notification: Notification;
  triggerType: NotificationTriggerType;
  scheduledForUtc?: Date | null;
}): Promise<NotificationDispatchResult> {
  const notification = params.notification;
  const executionId = randomUUID();
  const attemptedAt = new Date();

  const cards = await prisma.customerLoyaltyCard.findMany({
    where: {
      customer: {
        businessId: notification.businessId,
      },
    },
    select: {
      id: true,
      googleWalletObjectId: true,
      customer: {
        select: {
          email: true,
        },
      },
      template: {
        select: {
          id: true,
          maxPoints: true,
        },
      },
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
        select: {
          stampCount: true,
          cycleNumber: true,
        },
      },
      appleWalletRegistrations: {
        take: 1,
        select: {
          passTypeIdentifier: true,
        },
      },
    },
  });

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const card of cards) {
    const cardTarget = card as CardDeliveryTarget;

    const channels: NotificationChannel[] = [];
    if (cardTarget.appleWalletRegistrations.length > 0) {
      channels.push(NotificationChannel.APPLE_WALLET);
    }
    if (cardTarget.googleWalletObjectId) {
      channels.push(NotificationChannel.GOOGLE_WALLET);
    }

    if (channels.length === 0) {
      skippedCount += 1;
      continue;
    }

    for (const channel of channels) {
      const log = await createNotificationLog({
        notificationId: notification.id,
        businessId: notification.businessId,
        customerLoyaltyCardId: cardTarget.id,
        executionId,
        triggerType: params.triggerType,
        channel,
        scheduledForUtc: params.scheduledForUtc ?? attemptedAt,
      });

      const result =
        channel === NotificationChannel.APPLE_WALLET
          ? await sendAppleWalletNotificationForCard({ card: cardTarget })
          : await sendGoogleWalletNotificationForCard({
              notification,
              card: cardTarget,
              executionId,
            });

      await markNotificationLogResult({
        logId: log.id,
        status: result.status,
        attemptedAt: new Date(),
        errorCode: "errorCode" in result ? result.errorCode ?? null : null,
        errorMessage:
          "errorMessage" in result ? result.errorMessage ?? null : null,
        providerMessageId:
          "providerMessageId" in result ? result.providerMessageId ?? null : null,
      });

      if (result.status === NotificationLogStatus.SENT) {
        sentCount += 1;
      } else if (result.status === NotificationLogStatus.FAILED) {
        failedCount += 1;
      } else {
        skippedCount += 1;
      }
    }
  }

  return {
    notificationId: notification.id,
    executionId,
    triggerType: params.triggerType,
    sentCount,
    failedCount,
    skippedCount,
    targetCardCount: cards.length,
    attemptedAt,
  };
}

function computeNotificationNextRunAfterExecution(notification: Notification, runAtUtc: Date) {
  if (notification.deliveryMode !== NotificationDeliveryMode.SCHEDULED) {
    return {
      status: notification.status,
      nextRunAtUtc: notification.nextRunAtUtc,
    };
  }

  if (notification.scheduleType === NotificationScheduleType.ONCE) {
    return {
      status: NotificationStatus.INACTIVE,
      nextRunAtUtc: null,
    };
  }

  if (
    !notification.repeatPattern ||
    !notification.repeatTimeLocal ||
    !notification.timezone
  ) {
    return {
      status: notification.status,
      nextRunAtUtc: null,
    };
  }

  const baseTime = new Date(
    (notification.nextRunAtUtc ?? runAtUtc).getTime() + 1_000,
  );
  const nextRunAtUtc = computeNextRecurringRunAtUtc(
    {
      repeatPattern: notification.repeatPattern,
      repeatDays: notification.repeatDays,
      monthlyDayOfMonth: notification.monthlyDayOfMonth ?? null,
      repeatTimeLocal: notification.repeatTimeLocal,
      timezone: notification.timezone,
      createdAt: notification.createdAt,
    },
    baseTime,
  );

  return {
    status: notification.status,
    nextRunAtUtc,
  };
}

let notificationSchedulerTickRunning = false;

export async function runNotificationSchedulerTick() {
  if (notificationSchedulerTickRunning) {
    return { skipped: true as const, reason: "tick-already-running" as const };
  }

  notificationSchedulerTickRunning = true;
  try {
    const now = new Date();
    const batchSizeRaw = Number.parseInt(
      process.env.NOTIFICATION_SCHEDULER_BATCH_SIZE ?? "20",
      10,
    );
    const batchSize =
      Number.isInteger(batchSizeRaw) && batchSizeRaw > 0
        ? Math.min(batchSizeRaw, 100)
        : 20;

    const dueOrUnscheduled = await prisma.notification.findMany({
      where: {
        status: NotificationStatus.ACTIVE,
        deliveryMode: NotificationDeliveryMode.SCHEDULED,
        OR: [
          { nextRunAtUtc: { lte: now } },
          {
            scheduleType: NotificationScheduleType.REPEAT,
            nextRunAtUtc: null,
          },
        ],
      },
      orderBy: [{ nextRunAtUtc: "asc" }, { createdAt: "asc" }],
      take: batchSize,
    });

    let executedCount = 0;
    let initializedCount = 0;

    for (const candidate of dueOrUnscheduled) {
      let notification = candidate;

      if (
        notification.scheduleType === NotificationScheduleType.REPEAT &&
        notification.nextRunAtUtc === null &&
        notification.repeatPattern &&
        notification.repeatTimeLocal
      ) {
        const computed = computeNextRecurringRunAtUtc(
          {
            repeatPattern: notification.repeatPattern,
            repeatDays: notification.repeatDays,
            monthlyDayOfMonth: notification.monthlyDayOfMonth ?? null,
            repeatTimeLocal: notification.repeatTimeLocal,
            timezone: notification.timezone,
            createdAt: notification.createdAt,
          },
          new Date(now.getTime() - 1_000),
        );

        await prisma.notification.update({
          where: { id: notification.id },
          data: { nextRunAtUtc: computed },
        });
        initializedCount += 1;

        if (!computed || computed.getTime() > now.getTime()) {
          continue;
        }

        notification = { ...notification, nextRunAtUtc: computed };
      }

      if (!notification.nextRunAtUtc || notification.nextRunAtUtc.getTime() > now.getTime()) {
        continue;
      }

      const result = await executeNotificationDispatch({
        notification,
        triggerType: NotificationTriggerType.SCHEDULED,
        scheduledForUtc: notification.nextRunAtUtc,
      });

      const nextState = computeNotificationNextRunAfterExecution(
        notification,
        result.attemptedAt,
      );

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          lastRunAtUtc: result.attemptedAt,
          nextRunAtUtc: nextState.nextRunAtUtc,
          status: nextState.status,
        },
      });

      executedCount += 1;

      console.log("[notification-scheduler] executed", {
        notificationId: notification.id,
        sent: result.sentCount,
        failed: result.failedCount,
        skipped: result.skippedCount,
        nextRunAtUtc: nextState.nextRunAtUtc?.toISOString() ?? null,
        status: nextState.status,
      });
    }

    if (dueOrUnscheduled.length > 0) {
      console.log("[notification-scheduler] tick", {
        candidates: dueOrUnscheduled.length,
        initialized: initializedCount,
        executed: executedCount,
      });
    }

    return {
      skipped: false as const,
      candidates: dueOrUnscheduled.length,
      initialized: initializedCount,
      executed: executedCount,
    };
  } catch (error) {
    console.error("[notification-scheduler] tick failed", error);
    return { skipped: false as const, error: true as const };
  } finally {
    notificationSchedulerTickRunning = false;
  }
}

async function sendNotificationNow(req: Request, res: Response) {
  const businessId = req.authUser?.businessId;
  if (!businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const scoped = await requireScopedNotification(req.params.id, businessId);
  if ("error" in scoped && scoped.error) {
    return res.status(scoped.error.status).json({ message: scoped.error.message });
  }

  const notification = scoped.notification;
  const result = await executeNotificationDispatch({
    notification,
    triggerType: NotificationTriggerType.MANUAL_NOW,
    scheduledForUtc: new Date(),
  });

  await prisma.notification.update({
    where: { id: notification.id },
    data: { lastRunAtUtc: result.attemptedAt },
  });

  return res.status(200).json({
    notificationId: notification.id,
    executionId: result.executionId,
    triggerType: "manual_now",
    sentCount: result.sentCount,
    failedCount: result.failedCount,
    skippedCount: result.skippedCount,
    targetCardCount: result.targetCardCount,
    attemptedAt: result.attemptedAt.toISOString(),
  });
}

export const notificationController = {
  createNotification,
  listNotificationsByBusiness,
  listNotificationLogsByBusiness,
  getNotificationById,
  updateNotification,
  updateNotificationStatus,
  deleteNotification,
  sendNotificationNow,
};
