import { runNotificationSchedulerTick } from "./notification.controller.js";

let started = false;
let intervalHandle: NodeJS.Timeout | null = null;

function isEnabled() {
  const raw = (process.env.ENABLE_NOTIFICATION_SCHEDULER ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function getIntervalMs() {
  const raw = Number.parseInt(
    process.env.NOTIFICATION_SCHEDULER_INTERVAL_MS ?? "60000",
    10,
  );
  if (!Number.isInteger(raw) || raw < 5_000) {
    return 60_000;
  }
  return raw;
}

export function startNotificationScheduler() {
  if (started || !isEnabled()) {
    return;
  }

  started = true;
  const intervalMs = getIntervalMs();
  console.log("[notification-scheduler] enabled", { intervalMs });

  void runNotificationSchedulerTick();
  intervalHandle = setInterval(() => {
    void runNotificationSchedulerTick();
  }, intervalMs);

  if (typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }
}

