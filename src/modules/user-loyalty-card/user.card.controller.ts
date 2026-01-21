import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";

export const getCardById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const card = await prisma.costumerLoyaltyCard.findUnique({
    where: { id },
    include: {
      template: {
        select: {
          id: true,
          title: true,
          maxPoints: true,
          cardColor: true,
          accentColor: true,
          textColor: true,
          businessId: true,
        },
      },
      CostumerLoyaltyCardCycle: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
  });

  res.json(card);
};

export const getCardsByCustomerId = async (req: Request, res: Response) => {
  const { costumerId } = req.params;

  const cards = await prisma.costumerLoyaltyCard.findMany({
    where: { costumerId },
    include: {
      template: {
        select: {
          id: true,
          title: true,
          maxPoints: true,
          cardColor: true,
          accentColor: true,
          textColor: true,
          businessId: true,
        },
      },
      CostumerLoyaltyCardCycle: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(cards);
};

export const createCustomerCard = async (req: Request, res: Response) => {
  const { costumerId, loyaltyCardTemplateId } = req.body as {
    costumerId?: string;
    loyaltyCardTemplateId?: string;
  };

  if (!costumerId || typeof costumerId !== "string") {
    return res.status(400).json({ message: "costumerId is required" });
  }

  if (!loyaltyCardTemplateId || typeof loyaltyCardTemplateId !== "string") {
    return res
      .status(400)
      .json({ message: "loyaltyCardTemplateId is required" });
  }

  const [costumer, template] = await Promise.all([
    prisma.costumer.findUnique({
      where: { id: costumerId },
      select: { id: true, businessId: true },
    }),
    prisma.loyaltyCardTemplate.findUnique({
      where: { id: loyaltyCardTemplateId },
      select: { id: true, businessId: true },
    }),
  ]);

  if (!costumer) {
    return res.status(404).json({ message: "customer not found" });
  }

  if (!template) {
    return res.status(404).json({ message: "card template not found" });
  }

  if (costumer.businessId !== template.businessId) {
    return res.status(400).json({ message: "business mismatch" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const card = await tx.costumerLoyaltyCard.create({
        data: { costumerId, loyaltyCardTemplateId },
      });
      const cycle = await tx.costumerLoyaltyCardCycle.create({
        data: {
          costumerLoyaltyCardId: card.id,
          cycleNumber: 1,
          stampCount: 0,
        },
      });

      return { card, cycle };
    });

    return res.status(201).json(result);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return res.status(409).json({ message: "card already exists" });
    }
    throw error;
  }
};

export const userCardControllers = {
  getCardById,
  getCardsByCustomerId,
  createCustomerCard,
};
