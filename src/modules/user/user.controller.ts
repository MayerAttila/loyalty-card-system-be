import type { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import bcrypt from "bcryptjs";

export const getUserById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id },
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

export const getAllUsersByBusinessId = async (req: Request, res: Response) => {
  const { businessId } = req.params;
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
  const { name, email, businessId, password, role } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, businessId, password: hashed, role },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      updatedAt: true,
      role: true,
    },
  });

  res.status(201).json(user);
};

export const userControllers = {
  getUserById,
  getAllUsersByBusinessId,
  createUser,
};
