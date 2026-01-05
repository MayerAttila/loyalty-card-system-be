import type { ErrorRequestHandler } from "express";
import { ApiError } from "./apiError";

export const errorMiddleware: ErrorRequestHandler = (err, req, res, next) => {
  const status = err instanceof ApiError ? err.statusCode : 500;

  res.status(status).json({
    message: err.message ?? "Internal Server Error",
    details: err instanceof ApiError ? err.details : undefined,
  });
};
