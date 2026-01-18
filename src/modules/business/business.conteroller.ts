import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";

export const getAllBusinesses = async (req: Request, res: Response) => {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      address: true,
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
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(business);
};

export const createBusiness = async (req: Request, res: Response) => {
  const { name, address } = req.body;
  const business = await prisma.business.create({
    data: { name, address },
    select: {
      id: true,
      name: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json(business);
};

export const updateBusiness = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, address } = req.body as { name?: string; address?: string };

  if (!name || typeof name !== "string") {
    return res.status(400).json({ message: "name is required" });
  }

  const business = await prisma.business.update({
    where: { id },
    data: { name, address },
    select: {
      id: true,
      name: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(business);
};

export const businessController = {
  getAllBusinesses,
  getBusinessById,
  createBusiness,
  updateBusiness,
};
