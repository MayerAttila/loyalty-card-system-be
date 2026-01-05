import type { Request, Response } from "express";
import { prisma } from "../../prisma/client";

async function getAllUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany();
  res.json(users);
}

async function getUserByEmail(req: Request, res: Response) {
  const { email } = req.params;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  res.json(user);
}

async function getUserById(req: Request, res: Response) {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
  });

  res.json(user);
}

async function createUser(req: Request, res: Response) {
  const { email, name } = req.body;

  const user = await prisma.user.create({
    data: { email, name },
  });

  res.status(201).json(user);
}

export const userController = {
  getAllUsers,
  getUserByEmail,
  getUserById,
  createUser,
};
