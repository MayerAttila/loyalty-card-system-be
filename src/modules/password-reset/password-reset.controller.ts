import type { Request, Response } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../prisma/client.js";
import { sendPasswordResetEmail } from "../../common/utils/mailer.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TOKEN_TTL_MINUTES = 30;
const TOKEN_SIZE_BYTES = 32;

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown) => normalizeString(value).toLowerCase();

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const getPasswordRuleError = (password: string) => {
  const failures: string[] = [];
  if (password.length < 8) {
    failures.push("be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    failures.push("include at least one uppercase letter");
  }
  if (!/\d/.test(password)) {
    failures.push("include at least one number");
  }
  if (!failures.length) return null;

  if (failures.length === 1) return `password must ${failures[0]}`;
  if (failures.length === 2) {
    return `password must ${failures[0]} and ${failures[1]}`;
  }
  return `password must ${failures[0]}, ${failures[1]}, and ${failures[2]}`;
};

const getResetTokenTtlMinutes = () => {
  const raw = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_TOKEN_TTL_MINUTES;
  }
  return Math.floor(raw);
};

const resolveResetBaseUrl = (req: Request) => {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const origin = req.get("origin")?.trim();
  return origin ? origin.replace(/\/$/, "") : "";
};

type PasswordResetTokenRow = {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: "A valid email is required." });
  }

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
    },
  });

  if (!user) {
    return res.status(404).json({ message: "No account found with this email." });
  }
  if (!user.password) {
    return res
      .status(400)
      .json({ message: "This account does not support password reset." });
  }

  const resetBaseUrl = resolveResetBaseUrl(req);
  if (!resetBaseUrl) {
    console.error("requestPasswordReset failed: APP_BASE_URL is not configured");
    return res.status(500).json({ message: "Unable to send reset email." });
  }

  const ttlMinutes = getResetTokenTtlMinutes();
  const rawToken = randomBytes(TOKEN_SIZE_BYTES).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const resetUrl = `${resetBaseUrl}/reset-password?token=${encodeURIComponent(
    rawToken,
  )}`;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM "PasswordResetToken"
        WHERE "userId" = ${user.id} AND "usedAt" IS NULL
      `;
      await tx.$executeRaw`
        INSERT INTO "PasswordResetToken" ("id", "userId", "tokenHash", "expiresAt", "createdAt")
        VALUES (${randomUUID()}, ${user.id}, ${tokenHash}, ${expiresAt}, NOW())
      `;
    });

    await sendPasswordResetEmail({
      to: user.email,
      userName: user.name,
      resetUrl,
      expiresInMinutes: ttlMinutes,
    });
  } catch (error) {
    console.error("requestPasswordReset failed", error);
    return res.status(500).json({ message: "Unable to send reset email." });
  }

  return res.status(200).json({ message: "Reset link sent successfully." });
};

export const confirmPasswordReset = async (req: Request, res: Response) => {
  const token = normalizeString(req.body?.token);
  const newPassword = normalizeString(req.body?.newPassword);

  if (!token) {
    return res.status(400).json({ message: "Token is required." });
  }
  if (!newPassword) {
    return res.status(400).json({ message: "New password is required." });
  }

  const passwordRuleError = getPasswordRuleError(newPassword);
  if (passwordRuleError) {
    return res.status(400).json({ message: passwordRuleError });
  }

  const now = new Date();
  const tokenHash = hashToken(token);
  const tokenRows = await prisma.$queryRaw<PasswordResetTokenRow[]>`
    SELECT "id", "userId", "expiresAt", "usedAt"
    FROM "PasswordResetToken"
    WHERE "tokenHash" = ${tokenHash}
    LIMIT 1
  `;
  const resetToken = tokenRows[0];

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) {
    return res.status(400).json({ message: "Invalid or expired reset token." });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      });
      await tx.$executeRaw`
        UPDATE "PasswordResetToken"
        SET "usedAt" = NOW()
        WHERE "userId" = ${resetToken.userId} AND "usedAt" IS NULL
      `;
    });
    return res.status(200).json({ message: "Password has been reset." });
  } catch (error) {
    console.error("confirmPasswordReset failed", error);
    return res.status(500).json({ message: "Unable to reset password." });
  }
};

export const passwordResetController = {
  requestPasswordReset,
  confirmPasswordReset,
};
