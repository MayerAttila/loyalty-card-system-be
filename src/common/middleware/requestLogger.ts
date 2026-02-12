import type { NextFunction, Request, Response } from "express";

const ANSI = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
} as const;

const supportsColor = !process.env.NO_COLOR;

const colorize = (text: string, color: string) =>
  supportsColor ? `${color}${text}${ANSI.reset}` : text;

const logLine = (statusCode: number, routeText: string, detailsText: string) => {
  const ok = statusCode < 400;
  const level = ok ? "SUCCESS" : "FAILED";
  const levelColor = ok ? ANSI.green : ANSI.red;

  const line =
    `[api] ${colorize(routeText, ANSI.blue)} -> ` +
    `${colorize(`${level} ${statusCode}`, levelColor)} ` +
    `${colorize(detailsText, ANSI.gray)}`;

  if (!ok) {
    console.error(line);
    return;
  }
  console.info(line);
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = process.hrtime.bigint();
  const method = req.method;
  const url = req.originalUrl || req.url;

  let logged = false;
  const writeLog = (event: "finish" | "close") => {
    if (logged) return;
    logged = true;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const statusCode = res.statusCode;
    const routeText = `${method} ${url}`;
    const detailsText = `(${durationMs.toFixed(1)}ms, ${event})`;

    logLine(statusCode, routeText, detailsText);
  };

  res.on("finish", () => writeLog("finish"));
  res.on("close", () => writeLog("close"));

  next();
};
