import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";

async function getAllCustomer(req: Request, res: Response) {
  const customers = await prisma.customer.findMany();
  res.json(customers);
}

async function getCustomerByEmail(req: Request, res: Response) {
  const { email } = req.params;

  const customer = await prisma.customer.findUnique({
    where: { email },
  });

  res.json(customer);
}

async function getCustomerById(req: Request, res: Response) {
  const { id } = req.params;

  const customer = await prisma.customer.findUnique({
    where: { id },
  });

  res.json(customer);
}

async function getCustomersByBusinessId(req: Request, res: Response) {
  const { businessId } = req.params;

  const customers = await prisma.customer.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      email: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { customerLoyaltyCards: true },
      },
      customerLoyaltyCards: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          googleWalletObjectId: true,
          createdAt: true,
          template: {
            select: {
              title: true,
              maxPoints: true,
            },
          },
          customerLoyaltyCardCycles: {
            orderBy: { cycleNumber: "desc" },
            take: 1,
            select: {
              cycleNumber: true,
              stampCount: true,
              stampingLogs: {
                orderBy: { stampedAt: "desc" },
                take: 1,
                select: {
                  stampedAt: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(
    customers.map((customer) => ({
      ...customer,
      loyaltyCardCount: customer._count.customerLoyaltyCards,
      cardSummary: (() => {
        const card = customer.customerLoyaltyCards[0];
        if (!card) return null;
        const cycle = card.customerLoyaltyCardCycles[0];
        const maxPoints = card.template?.maxPoints ?? null;
        const cycleNumber = cycle?.cycleNumber ?? 1;
        return {
          templateTitle: card.template?.title ?? null,
          stampCount: cycle?.stampCount ?? 0,
          maxPoints,
          rewardsEarned: Math.max(cycleNumber - 1, 0),
          lastActivity: cycle?.stampingLogs[0]?.stampedAt ?? null,
          hasWallet: Boolean(card.googleWalletObjectId),
        };
      })(),
    }))
  );
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

  const existing = await prisma.customer.findUnique({
    where: { email },
  });

  if (existing && existing.businessId !== businessId) {
    return res.status(409).json({
      message: "customer already exists for a different business",
    });
  }

  const customer =
    existing ??
    (await prisma.customer.create({
      data: { email, name, businessId },
    }));

  let loyaltyCardId: string | null = null;
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
        const card = await tx.customerLoyaltyCard.create({
          data: {
            customerId: customer.id,
            loyaltyCardTemplateId: activeTemplate.id,
          },
        });
        loyaltyCardId = card.id;
        await tx.customerLoyaltyCardCycle.create({
          data: {
            customerLoyaltyCardId: card.id,
            cycleNumber: 1,
            stampCount: 0,
          },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        const existingCard = await prisma.customerLoyaltyCard.findUnique({
          where: {
            customerId_loyaltyCardTemplateId: {
              customerId: customer.id,
              loyaltyCardTemplateId: activeTemplate.id,
            },
          },
          select: { id: true },
        });
        loyaltyCardId = existingCard?.id ?? null;
      } else {
        console.error("auto-create loyalty card failed", error);
      }
    }
  }

  res.status(existing ? 200 : 201).json({
    customer,
    cardId: loyaltyCardId,
  });
}

export const customerControllers = {
  getCustomerByEmail,
  getAllCustomer,
  getCustomerById,
  getCustomersByBusinessId,
  createCustomer,
};
