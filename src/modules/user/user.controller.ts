import type { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import bcrypt from "bcryptjs";

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

export const userControllers = {
  getUserById,
  getAllUsersByBusinessId,
  createUser,
  updateUserApproval,
  updateUserRole,
  deleteUser,
};
