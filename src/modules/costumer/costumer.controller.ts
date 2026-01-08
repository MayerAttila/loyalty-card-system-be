import type { Request, Response } from "express";
import { prisma } from "../../prisma/client";

async function getAllCustomer(req: Request, res: Response) {
  const customers = await prisma.costumer.findMany();
  res.json(customers);
}

async function getCustomerByEmail(req: Request, res: Response) {
  const { email } = req.params;

  const costumer = await prisma.costumer.findUnique({
    where: { email },
  });

  res.json(costumer);
}

async function getCustomerById(req: Request, res: Response) {
  const { id } = req.params;

  const costumer = await prisma.costumer.findUnique({
    where: { id },
  });

  res.json(costumer);
}

async function createCustomer(req: Request, res: Response) {
  const { email, name } = req.body;

  const costumer = await prisma.costumer.create({
    data: { email, name },
  });

  res.status(201).json(costumer);
}

export const costumerControllers = {
  getCustomerByEmail,
  getAllCustomer,
  getCustomerById,
  createCustomer,
};
