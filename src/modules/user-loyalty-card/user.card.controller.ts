import type { Request, Response } from "express";
import { getSession } from "@auth/express";
import { prisma } from "../../prisma/client.js";
import { authConfig } from "../../auth.js";
import { createSaveJwt, issuerId, walletRequest } from "../../lib/googleWallet.js";

export const getCardById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const card = await prisma.customerLoyaltyCard.findUnique({
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
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
  });

  res.json(card);
};

export const getCardsByCustomerId = async (req: Request, res: Response) => {
  const { customerId } = req.params;

  const cards = await prisma.customerLoyaltyCard.findMany({
    where: { customerId },
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
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(cards);
};

export const createCustomerCard = async (req: Request, res: Response) => {
  const { customerId, loyaltyCardTemplateId } = req.body as {
    customerId?: string;
    loyaltyCardTemplateId?: string;
  };

  if (!customerId || typeof customerId !== "string") {
    return res.status(400).json({ message: "customerId is required" });
  }

  if (!loyaltyCardTemplateId || typeof loyaltyCardTemplateId !== "string") {
    return res
      .status(400)
      .json({ message: "loyaltyCardTemplateId is required" });
  }

  const [customer, template] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, businessId: true },
    }),
    prisma.loyaltyCardTemplate.findUnique({
      where: { id: loyaltyCardTemplateId },
      select: { id: true, businessId: true },
    }),
  ]);

  if (!customer) {
    return res.status(404).json({ message: "customer not found" });
  }

  if (!template) {
    return res.status(404).json({ message: "card template not found" });
  }

  if (customer.businessId !== template.businessId) {
    return res.status(400).json({ message: "business mismatch" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const card = await tx.customerLoyaltyCard.create({
        data: { customerId, loyaltyCardTemplateId },
      });
      const cycle = await tx.customerLoyaltyCardCycle.create({
        data: {
          customerLoyaltyCardId: card.id,
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

export const getGoogleWalletSaveLink = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "id is required" });
  }

  const card = await prisma.customerLoyaltyCard.findUnique({
    where: { id },
    include: {
      customer: true,
      template: {
        include: {
          business: true,
        },
      },
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!card) {
    return res.status(404).json({ message: "card not found" });
  }

  const classId =
    card.template.googleWalletClassId ?? `${issuerId}.${card.template.id}`;
  const objectId = card.googleWalletObjectId ?? `${issuerId}.${card.id}`;

  const classRes = await walletRequest(
    `/loyaltyClass/${encodeURIComponent(classId)}`
  );
  if (classRes.status === 404) {
    const logo = await prisma.image.findFirst({
      where: { businessId: card.template.businessId, kind: "BUSINESS_LOGO" },
      select: { url: true },
    });
    if (!logo) {
      return res.status(400).json({
        message: "business logo is required for Google Wallet",
      });
    }

    const createClassRes = await walletRequest("/loyaltyClass", {
      method: "POST",
      body: {
        id: classId,
        issuerName: card.template.business.name,
        programName: card.template.title,
        programLogo: {
          sourceUri: { uri: logo.url },
        },
        accountIdLabel: "Card ID",
        accountNameLabel: "Customer",
        reviewStatus: "underReview",
      },
    });
    if (!createClassRes.ok) {
      const errorText = await createClassRes.text();
      let errorDetails: unknown = errorText;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        // keep raw text
      }
      return res.status(createClassRes.status).json({
        message: "failed to create loyalty class",
        details: errorDetails,
      });
    }
    if (!card.template.googleWalletClassId) {
      await prisma.loyaltyCardTemplate.update({
        where: { id: card.template.id },
        data: { googleWalletClassId: classId },
      });
    }
  } else if (!classRes.ok) {
    const errorText = await classRes.text();
    let errorDetails: unknown = errorText;
    try {
      errorDetails = JSON.parse(errorText);
    } catch {
      // keep raw text
    }
    return res.status(classRes.status).json({
      message: "failed to fetch loyalty class",
      details: errorDetails,
    });
  }

  const objectRes = await walletRequest(
    `/loyaltyObject/${encodeURIComponent(objectId)}`
  );
  if (objectRes.status === 404) {
    const stampCount = card.customerLoyaltyCardCycles[0]?.stampCount ?? 0;
    const createObjectRes = await walletRequest("/loyaltyObject", {
      method: "POST",
      body: {
        id: objectId,
        classId,
        state: "ACTIVE",
        accountId: card.id,
        accountName: card.customer.name,
        barcode: {
          type: "QR_CODE",
          value: card.id,
          alternateText: "Loyalty card",
        },
        loyaltyPoints: {
          label: "Stamps",
          balance: {
            string: `${stampCount}/${card.template.maxPoints}`,
          },
        },
        textModulesData: [
          {
            header: "Customer",
            body: card.customer.email,
          },
        ],
      },
    });
    if (!createObjectRes.ok) {
      const errorText = await createObjectRes.text();
      let errorDetails: unknown = errorText;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        // keep raw text
      }
      return res.status(createObjectRes.status).json({
        message: "failed to create loyalty object",
        details: errorDetails,
      });
    }
    if (!card.googleWalletObjectId) {
      await prisma.customerLoyaltyCard.update({
        where: { id: card.id },
        data: { googleWalletObjectId: objectId },
      });
    }
  } else if (!objectRes.ok) {
    const errorText = await objectRes.text();
    let errorDetails: unknown = errorText;
    try {
      errorDetails = JSON.parse(errorText);
    } catch {
      // keep raw text
    }
    return res.status(objectRes.status).json({
      message: "failed to fetch loyalty object",
      details: errorDetails,
    });
  }

  const saveJwt = createSaveJwt(objectId, classId);
  const saveUrl = `https://pay.google.com/gp/v/save/${saveJwt}`;

  res.json({ saveUrl, classId, objectId });
};

export const stampCard = async (req: Request, res: Response) => {
  const session = await getSession(req, authConfig);
  if (!session?.user) {
    return res.status(401).json({ message: "unauthorized" });
  }

  const userId = (session.user as { id?: string }).id;
  const businessId = (session.user as { businessId?: string }).businessId;
  const approved = (session.user as { approved?: boolean }).approved;

  if (!userId || !businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  if (approved === false) {
    return res.status(403).json({ message: "user not approved" });
  }

  const { id: cardId } = req.params;
  if (!cardId) {
    return res.status(400).json({ message: "card id is required" });
  }

  const card = await prisma.customerLoyaltyCard.findUnique({
    where: { id: cardId },
    include: {
      template: {
        select: {
          businessId: true,
          maxPoints: true,
          title: true,
        },
      },
      customer: {
        select: { name: true, email: true },
      },
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!card) {
    return res.status(404).json({ message: "card not found" });
  }

  if (card.template.businessId !== businessId) {
    return res.status(403).json({ message: "card not in your business" });
  }

  const activeCycle = card.customerLoyaltyCardCycles[0];
  if (!activeCycle) {
    return res.status(400).json({ message: "no active card cycle" });
  }

  if (activeCycle.stampCount >= card.template.maxPoints) {
    return res.status(409).json({ message: "card already full" });
  }

  const nextCount = activeCycle.stampCount + 1;
  const completedAt =
    nextCount >= card.template.maxPoints ? new Date() : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.customerLoyaltyCardCycle.update({
      where: { id: activeCycle.id },
      data: {
        stampCount: nextCount,
        ...(completedAt ? { completedAt } : {}),
      },
    });

    await tx.stampingLog.create({
      data: {
        customerLoyaltyCardCycleId: activeCycle.id,
        stampedById: userId,
      },
    });
  });

  const objectId =
    card.googleWalletObjectId ?? `${issuerId}.${card.id}`;
  let walletUpdated = false;
  let walletUpdateError: unknown = null;

  try {
    const updateRes = await walletRequest(
      `/loyaltyObject/${encodeURIComponent(objectId)}?updateMask=loyaltyPoints`,
      {
        method: "PATCH",
        body: {
          loyaltyPoints: {
            label: "Stamps",
            balance: {
              string: `${nextCount}/${card.template.maxPoints}`,
            },
          },
        },
      }
    );

    if (updateRes.ok) {
      walletUpdated = true;
    } else {
      const errorText = await updateRes.text();
      try {
        walletUpdateError = JSON.parse(errorText);
      } catch {
        walletUpdateError = errorText;
      }
    }
  } catch (error) {
    walletUpdateError = (error as Error).message ?? "wallet update failed";
  }

  return res.json({
    cardId: card.id,
    customerName: card.customer.name,
    customerEmail: card.customer.email,
    cardTitle: card.template.title,
    stampCount: nextCount,
    maxPoints: card.template.maxPoints,
    completed: nextCount >= card.template.maxPoints,
    walletUpdated,
    walletUpdateError,
  });
};

export const userCardControllers = {
  getCardById,
  getCardsByCustomerId,
  createCustomerCard,
  getGoogleWalletSaveLink,
  stampCard,
};
