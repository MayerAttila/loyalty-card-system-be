import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";

const loyaltyCardTemplatePreviewSelect = {
  id: true,
  template: true,
  text1: true,
  text2: true,
  maxPoints: true,
  cardColor: true,
  useStampImages: true,
  stampOnImageId: true,
  stampOffImageId: true,
} as const;

async function getAllCustomer(req: Request, res: Response) {
  const businessId = req.authUser?.businessId;
  if (!businessId) {
    return res.status(403).json({ message: "invalid session" });
  }
  const customers = await prisma.customer.findMany({
    where: { businessId },
  });
  res.json(customers);
}

async function getCustomerByEmail(req: Request, res: Response) {
  const { email } = req.params;
  const businessId = req.authUser?.businessId;
  if (!businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const customer = await prisma.customer.findUnique({
    where: { email },
  });
  if (!customer || customer.businessId !== businessId) {
    return res.status(404).json({ message: "customer not found" });
  }

  res.json(customer);
}

async function getCustomerById(req: Request, res: Response) {
  const { id } = req.params;
  const businessId = req.authUser?.businessId;
  if (!businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
  });
  if (!customer || customer.businessId !== businessId) {
    return res.status(404).json({ message: "customer not found" });
  }

  res.json(customer);
}

async function getCustomersByBusinessId(req: Request, res: Response) {
  const { businessId } = req.params;
  const sessionBusinessId = req.authUser?.businessId;
  if (!sessionBusinessId || sessionBusinessId !== businessId) {
    return res.status(403).json({ message: "forbidden business access" });
  }

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
              template: true,
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
          templateTitle: card.template?.template ?? null,
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
    select: { id: true, name: true },
  });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  const businessLogo = await prisma.image.findFirst({
    where: { businessId, kind: "BUSINESS_LOGO" },
    select: { url: true },
  });

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
      select: loyaltyCardTemplatePreviewSelect,
    })) ??
    (await prisma.loyaltyCardTemplate.findFirst({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: loyaltyCardTemplatePreviewSelect,
    }));

  let stampOnUrl: string | null = null;
  let stampOffUrl: string | null = null;

  if (
    activeTemplate?.useStampImages &&
    activeTemplate.stampOnImageId &&
    activeTemplate.stampOffImageId
  ) {
    const [stampOnImage, stampOffImage] = await Promise.all([
      prisma.image.findUnique({
        where: { id: activeTemplate.stampOnImageId },
        select: { url: true },
      }),
      prisma.image.findUnique({
        where: { id: activeTemplate.stampOffImageId },
        select: { url: true },
      }),
    ]);

    stampOnUrl = stampOnImage?.url ?? null;
    stampOffUrl = stampOffImage?.url ?? null;
  }

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
    cardPreview: activeTemplate
      ? {
          issuerName: activeTemplate.text1 ?? business.name,
          programName: activeTemplate.text2 ?? activeTemplate.template,
          maxPoints: activeTemplate.maxPoints,
          cardColor: activeTemplate.cardColor,
          logoUrl: businessLogo?.url ?? null,
          useStampImages:
            activeTemplate.useStampImages && Boolean(stampOnUrl && stampOffUrl),
          filledStampSrc: stampOnUrl,
          emptyStampSrc: stampOffUrl,
        }
      : null,
  });
}

export const customerControllers = {
  getCustomerByEmail,
  getAllCustomer,
  getCustomerById,
  getCustomersByBusinessId,
  createCustomer,
};
