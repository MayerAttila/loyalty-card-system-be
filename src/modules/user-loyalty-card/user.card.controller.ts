import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";
import { createSaveJwt, issuerId, walletRequest } from "../../lib/googleWallet.js";

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

export const getGoogleWalletSaveLink = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "id is required" });
  }

  const card = await prisma.costumerLoyaltyCard.findUnique({
    where: { id },
    include: {
      costumer: true,
      template: {
        include: {
          business: true,
        },
      },
      CostumerLoyaltyCardCycle: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!card) {
    return res.status(404).json({ message: "card not found" });
  }

  const classId = card.template.googleWalletClassId ?? `${issuerId}.${card.template.id}`;
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
        reviewStatus: "DRAFT",
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
    const stampCount = card.CostumerLoyaltyCardCycle[0]?.stampCount ?? 0;
    const createObjectRes = await walletRequest("/loyaltyObject", {
      method: "POST",
      body: {
        id: objectId,
        classId,
        state: "ACTIVE",
        accountId: card.id,
        accountName: card.costumer.name,
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
            body: card.costumer.email,
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
      await prisma.costumerLoyaltyCard.update({
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

export const userCardControllers = {
  getCardById,
  getCardsByCustomerId,
  createCustomerCard,
  getGoogleWalletSaveLink,
};
