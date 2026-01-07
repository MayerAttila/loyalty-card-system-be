import type { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import bcrypt from "bcryptjs";

export const getAllBusinesses = async (req: Request, res: Response) => {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(businesses);
};
export const getBusinessById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const business = await prisma.business.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      address: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(business);
};

export const createBusiness = async (req: Request, res: Response) => {
  const { name, address, email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const business = await prisma.business.create({
    data: { name, address, email, password: hashed },
    select: {
      id: true,
      name: true,
      address: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json(business);
};

export const businessController = {
  getAllBusinesses,
  getBusinessById,
  createBusiness,
};
