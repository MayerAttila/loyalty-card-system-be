import type { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import bcrypt from "bcryptjs";
import { sendEmployeeInviteEmail } from "../../common/utils/mailer.js";

export const getUserById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      approved: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    },
  });

  res.json(user);
};

export const getAllUsersByBusinessId = async (req: Request, res: Response) => {
  const { businessId } = req.params;
  const users = await prisma.user.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      email: true,
      approved: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    },
  });

  res.json(users);
};

export const createUser = async (req: Request, res: Response) => {
  const { name, email, businessId, password, role, approved } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, businessId, password: hashed, role, approved },
    select: {
      id: true,
      name: true,
      email: true,
      approved: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    },
  });

  res.status(201).json(user);
};

export const updateUserApproval = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { approved } = req.body as { approved?: boolean };

  if (typeof approved !== "boolean") {
    return res.status(400).json({ message: "approved must be a boolean" });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { approved },
    select: {
      id: true,
      name: true,
      email: true,
      approved: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    },
  });

  res.json(user);
};

export const updateUserRole = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body as { role?: UserRole };
  const allowedRoles: UserRole[] = ["OWNER", "ADMIN", "STAFF"];

  if (!role || !allowedRoles.includes(role)) {
    return res.status(400).json({ message: "role must be OWNER, ADMIN, or STAFF" });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: {
      id: true,
      name: true,
      email: true,
      approved: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    },
  });

  res.json(user);
};

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  await prisma.user.delete({ where: { id } });

  res.status(204).send();
};

export const updateUserProfile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email } = req.body as {
    name?: string;
    email?: string;
  };

  const nextName = typeof name === "string" ? name.trim() : undefined;
  const nextEmail = typeof email === "string" ? email.trim() : undefined;

  if (!nextName && !nextEmail) {
    return res.status(400).json({ message: "name or email is required" });
  }

  if (nextEmail && !/.+@.+\..+/.test(nextEmail)) {
    return res.status(400).json({ message: "email is invalid" });
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
        approved: true,
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

  if (!email || typeof email !== "string") {
    return res.status(400).json({ message: "email is required" });
  }

  if (!businessId || typeof businessId !== "string") {
    return res.status(400).json({ message: "businessId is required" });
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
  updateUserApproval,
  updateUserRole,
  deleteUser,
  updateUserProfile,
  sendEmployeeInvite,
};
