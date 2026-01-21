import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";

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
  const { email, name, businessId } = req.body as {
    email?: string;
    name?: string;
    businessId?: string;
  };

  if (!name || typeof name !== "string") {
    return res.status(400).json({ message: "name is required" });
  }

  if (!email || typeof email !== "string") {
    return res.status(400).json({ message: "email is required" });
  }

  if (!businessId || typeof businessId !== "string") {
    return res.status(400).json({ message: "businessId is required" });
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  const costumer = await prisma.costumer.create({
    data: { email, name, businessId },
  });

  const activeTemplate =
    (await prisma.loyaltyCardTemplate.findFirst({
      where: { businessId, isActive: true },
      select: { id: true },
    })) ??
    (await prisma.loyaltyCardTemplate.findFirst({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }));

  if (activeTemplate) {
    try {
      await prisma.$transaction(async (tx) => {
        const card = await tx.costumerLoyaltyCard.create({
          data: {
            costumerId: costumer.id,
            loyaltyCardTemplateId: activeTemplate.id,
          },
        });
        await tx.costumerLoyaltyCardCycle.create({
          data: {
            costumerLoyaltyCardId: card.id,
            cycleNumber: 1,
            stampCount: 0,
          },
        });
      });
    } catch (error) {
      console.error("auto-create loyalty card failed", error);
    }
  }

  res.status(201).json(costumer);
}

export const costumerControllers = {
  getCustomerByEmail,
  getAllCustomer,
  getCustomerById,
  createCustomer,
};
