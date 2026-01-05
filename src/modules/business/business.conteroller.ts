import type { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import { get } from "node:http";

export const getAllBusinesses = async (req: Request, res: Response) => {
  const businesses = await prisma.business.findMany();

  res.json(businesses);
};
export const getBusinessById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const business = await prisma.business.findUnique({
    where: { id },
  });

  res.json(business);
};

export const createBusiness = async (req: Request, res: Response) => {
  const { name, address, email } = req.body;
  const business = await prisma.business.create({
    data: { name, address, email },
  });

  res.status(201).json(business);
};

export const businessController = {
  getAllBusinesses,
  getBusinessById,
  createBusiness,
};
