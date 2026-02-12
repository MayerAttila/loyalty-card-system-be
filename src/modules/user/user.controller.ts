import type { Request, Response } from "express";
import { getSession } from "@auth/express";
import { UserRole } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import bcrypt from "bcryptjs";
import { authConfig } from "../../auth.js";
import {
  sendBusinessWelcomeEmail,
  sendEmployeeInviteEmail,
} from "../../common/utils/mailer.js";

type SessionActor = {
  id?: string;
  businessId?: string;
  role?: UserRole | string;
};

const isElevatedRole = (role: UserRole) => role === "OWNER" || role === "ADMIN";
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

  if (failures.length === 1) {
    return `password must ${failures[0]}`;
  }
  if (failures.length === 2) {
    return `password must ${failures[0]} and ${failures[1]}`;
  }
  return `password must ${failures[0]}, ${failures[1]}, and ${failures[2]}`;
};

const getSessionActor = async (req: Request): Promise<SessionActor | null> => {
  const session = await getSession(req, authConfig);
  return ((session?.user as SessionActor | undefined) ?? null);
};

export const getUserById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const sessionBusinessId = req.authUser?.businessId;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    },
  });

  if (!user || (sessionBusinessId && user.businessId !== sessionBusinessId)) {
    return res.status(404).json({ message: "user not found" });
  }

  const { businessId: _businessId, ...safeUser } = user;
  res.json(safeUser);
};

export const getAllUsersByBusinessId = async (req: Request, res: Response) => {
  const { businessId } = req.params;
  const sessionBusinessId = req.authUser?.businessId;
  if (!sessionBusinessId || sessionBusinessId !== businessId) {
    return res.status(403).json({ message: "forbidden business access" });
  }
  const users = await prisma.user.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    },
  });

  res.json(users);
};

export const createUser = async (req: Request, res: Response) => {
  const { name, email, businessId, password, role } = req.body as {
    name?: string;
    email?: string;
    businessId?: string;
    password?: string;
    role?: UserRole;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "name is required" });
  }
  if (!email || typeof email !== "string") {
    return res.status(400).json({ message: "email is required" });
  }
  if (!/.+@.+\..+/.test(email)) {
    return res.status(400).json({ message: "email is invalid" });
  }
  if (!businessId || typeof businessId !== "string") {
    return res.status(400).json({ message: "businessId is required" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ message: "password is required" });
  }
  const passwordRuleError = getPasswordRuleError(password);
  if (passwordRuleError) {
    return res.status(400).json({ message: passwordRuleError });
  }

  const allowedRoles: UserRole[] = ["OWNER", "ADMIN", "STAFF"];
  const nextRole = role && allowedRoles.includes(role) ? role : undefined;
  const requestedRole = nextRole ?? "STAFF";

  const actor = await getSessionActor(req);
  if (actor?.businessId && actor.businessId !== businessId) {
    return res.status(403).json({ message: "forbidden business access" });
  }

  if (isElevatedRole(requestedRole)) {
    let allowedByActor = false;
    if (actor?.businessId === businessId) {
      if (actor.role === "OWNER") {
        allowedByActor = true;
      }
      if (actor.role === "ADMIN" && requestedRole !== "OWNER") {
        allowedByActor = true;
      }
    }

    if (!allowedByActor) {
      const existingUsers = await prisma.user.count({ where: { businessId } });
      const bootstrapOwnerAllowed = requestedRole === "OWNER" && existingUsers === 0;
      if (!bootstrapOwnerAllowed) {
        return res.status(403).json({
          message: "only business admins can assign elevated roles",
        });
      }
    }
  }

  const hashed = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        businessId,
        password: hashed,
        ...(nextRole ? { role: nextRole } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        role: true,
        business: {
          select: {
            name: true,
          },
        },
      },
    });

    const assignedRole = user.role;
    if (assignedRole === "OWNER") {
      const origin = req.get("origin") ?? "";
      const baseUrl = process.env.APP_BASE_URL ?? origin;
      const loginUrl = `${baseUrl.replace(/\/$/, "")}/login`;

      if (baseUrl) {
        try {
          await sendBusinessWelcomeEmail({
            to: user.email,
            businessName: user.business?.name ?? "your business",
            loginUrl,
          });
        } catch (error) {
          // Do not fail account creation on email issues.
          console.error("sendBusinessWelcomeEmail failed", error);
        }
      }
    }

    return res.status(201).json(user);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return res.status(409).json({ message: "email already in use" });
    }
    if (code === "P2003") {
      return res.status(400).json({ message: "invalid businessId" });
    }
    throw error;
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body as { role?: UserRole };
  const allowedRoles: UserRole[] = ["OWNER", "ADMIN", "STAFF"];
  const actor = req.authUser;

  if (!role || !allowedRoles.includes(role)) {
    return res.status(400).json({ message: "role must be OWNER, ADMIN, or STAFF" });
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, businessId: true, role: true },
  });
  if (!existing || existing.businessId !== actor?.businessId) {
    return res.status(404).json({ message: "user not found" });
  }
  if (role === "OWNER" && actor?.role !== "OWNER") {
    return res.status(403).json({ message: "only owners can assign owner role" });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    },
  });

  res.json(user);
};

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const actor = req.authUser;

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, businessId: true, role: true },
  });
  if (!existing || existing.businessId !== actor?.businessId) {
    return res.status(404).json({ message: "user not found" });
  }
  if (existing.role === "OWNER") {
    return res.status(403).json({ message: "owner account cannot be deleted" });
  }

  await prisma.user.delete({ where: { id } });

  res.status(204).send();
};

export const updateUserProfile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email } = req.body as {
    name?: string;
    email?: string;
  };
  const actor = req.authUser;

  const nextName = typeof name === "string" ? name.trim() : undefined;
  const nextEmail = typeof email === "string" ? email.trim() : undefined;

  if (!nextName && !nextEmail) {
    return res.status(400).json({ message: "name or email is required" });
  }

  if (nextEmail && !/.+@.+\..+/.test(nextEmail)) {
    return res.status(400).json({ message: "email is invalid" });
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { businessId: true },
  });
  if (!existing || existing.businessId !== actor?.businessId) {
    return res.status(404).json({ message: "user not found" });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(nextName ? { name: nextName } : {}),
        ...(nextEmail ? { email: nextEmail } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        role: true,
      },
    });

    res.json(user);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return res.status(409).json({ message: "email already in use" });
    }
    throw error;
  }
};

export const sendEmployeeInvite = async (req: Request, res: Response) => {
  const { email, businessId } = req.body as {
    email?: string;
    businessId?: string;
  };
  const actor = req.authUser;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ message: "email is required" });
  }

  if (!businessId || typeof businessId !== "string") {
    return res.status(400).json({ message: "businessId is required" });
  }
  if (!actor?.businessId || actor.businessId !== businessId) {
    return res.status(403).json({ message: "forbidden business access" });
  }

  if (!/.+@.+\..+/.test(email)) {
    return res.status(400).json({ message: "email is invalid" });
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true },
  });

  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  const origin = req.get("origin") ?? "";
  const baseUrl = process.env.APP_BASE_URL ?? origin;
  if (!baseUrl) {
    return res.status(500).json({ message: "APP_BASE_URL is not configured" });
  }

  const inviteUrl = `${baseUrl.replace(/\/$/, "")}/join-business?invite=1&businessId=${encodeURIComponent(
    businessId
  )}`;

  try {
    await sendEmployeeInviteEmail({
      to: email,
      businessName: business.name,
      inviteUrl,
    });
  } catch (error) {
    console.error("sendEmployeeInvite failed", error);
    return res.status(500).json({ message: "Unable to send invite email" });
  }

  res.json({ message: "Invite sent" });
};

export const userControllers = {
  getUserById,
  getAllUsersByBusinessId,
  createUser,
  updateUserRole,
  deleteUser,
  updateUserProfile,
  sendEmployeeInvite,
};
