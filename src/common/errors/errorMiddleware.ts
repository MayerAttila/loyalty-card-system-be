import type { ErrorRequestHandler } from "express";
import { MulterError } from "multer";
import { ApiError } from "./ApiError.js";

export const errorMiddleware: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File too large" : "Invalid file upload";
    return res.status(400).json({ message });
  }

  const status = err instanceof ApiError ? err.statusCode : 500;

  res.status(status).json({
    message: err.message ?? "Internal Server Error",
    details: err instanceof ApiError ? err.details : undefined,
  });
};
