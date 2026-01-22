import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";
import { issuerId, walletRequest } from "../../lib/googleWallet.js";

export const getCardTemplateById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const template = await prisma.loyaltyCardTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      maxPoints: true,
      cardColor: true,
      accentColor: true,
      textColor: true,
      isActive: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(template);
};

export const getCardTemplatesByBusinessId = async (
  req: Request,
  res: Response
) => {
  const { businessId } = req.params;
  const templates = await prisma.loyaltyCardTemplate.findMany({
    where: { businessId },
    select: {
      id: true,
      title: true,
      maxPoints: true,
      cardColor: true,
      accentColor: true,
      textColor: true,
      isActive: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(templates);
};

export const createCardTemplate = async (req: Request, res: Response) => {
  const {
    title,
    businessId,
    maxPoints,
    cardColor,
    accentColor,
    textColor,
    isActive,
  } = req.body as {
    title?: string;
    businessId?: string;
    maxPoints?: number;
    cardColor?: string;
    accentColor?: string;
    textColor?: string;
    isActive?: boolean;
  };

  if (!title || typeof title !== "string") {
    return res.status(400).json({ message: "title is required" });
  }

  if (!businessId || typeof businessId !== "string") {
    return res.status(400).json({ message: "businessId is required" });
  }

  if (maxPoints !== undefined && typeof maxPoints !== "number") {
    return res.status(400).json({ message: "maxPoints must be a number" });
  }

  if (!cardColor || typeof cardColor !== "string") {
    return res.status(400).json({ message: "cardColor is required" });
  }

  if (!accentColor || typeof accentColor !== "string") {
    return res.status(400).json({ message: "accentColor is required" });
  }

  if (!textColor || typeof textColor !== "string") {
    return res.status(400).json({ message: "textColor is required" });
  }

  if (isActive !== undefined && typeof isActive !== "boolean") {
    return res.status(400).json({ message: "isActive must be a boolean" });
  }

  let template;
  try {
    template = await prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.loyaltyCardTemplate.updateMany({
          where: { businessId },
          data: { isActive: false },
        });
      }

      return tx.loyaltyCardTemplate.create({
        data: {
          title,
          businessId,
          maxPoints,
          cardColor,
          accentColor,
          textColor,
          isActive: isActive ?? false,
        },
        select: {
          id: true,
          title: true,
          maxPoints: true,
          cardColor: true,
          accentColor: true,
          textColor: true,
          isActive: true,
          businessId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return res.status(409).json({
        message: "template title already exists for this business",
      });
    }
    throw error;
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true },
  });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  const logo = await prisma.image.findFirst({
    where: { businessId, kind: "BUSINESS_LOGO" },
    select: { url: true },
  });
  if (!logo) {
    return res.status(400).json({
      message: "business logo is required for Google Wallet",
    });
  }

  const classId = `${issuerId}.${template.id}`;
  const createClassRes = await walletRequest("/loyaltyClass", {
    method: "POST",
    body: {
      id: classId,
      issuerName: business.name,
      programName: template.title,
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

  await prisma.loyaltyCardTemplate.update({
    where: { id: template.id },
    data: { googleWalletClassId: classId },
  });

  res.status(201).json(template);
};

export const updateCardTemplate = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, maxPoints, cardColor, accentColor, textColor, isActive } =
    req.body as {
      title?: string;
      maxPoints?: number;
      cardColor?: string;
      accentColor?: string;
      textColor?: string;
      isActive?: boolean;
    };

  const data: {
    title?: string;
    maxPoints?: number;
    cardColor?: string;
    accentColor?: string;
    textColor?: string;
    isActive?: boolean;
  } = {};

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "title must be a string" });
    }
    data.title = title;
  }

  if (maxPoints !== undefined) {
    if (typeof maxPoints !== "number") {
      return res.status(400).json({ message: "maxPoints must be a number" });
    }
    data.maxPoints = maxPoints;
  }

  if (cardColor !== undefined) {
    if (typeof cardColor !== "string") {
      return res.status(400).json({ message: "cardColor must be a string" });
    }
    data.cardColor = cardColor;
  }

  if (accentColor !== undefined) {
    if (typeof accentColor !== "string") {
      return res.status(400).json({ message: "accentColor must be a string" });
    }
    data.accentColor = accentColor;
  }

  if (textColor !== undefined) {
    if (typeof textColor !== "string") {
      return res.status(400).json({ message: "textColor must be a string" });
    }
    data.textColor = textColor;
  }

  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }
    data.isActive = isActive;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "no fields to update" });
  }

  const template = await prisma.$transaction(async (tx) => {
    if (data.isActive) {
      const current = await tx.loyaltyCardTemplate.findUnique({
        where: { id },
        select: { businessId: true },
      });
      if (!current) {
        return null;
      }
      await tx.loyaltyCardTemplate.updateMany({
        where: { businessId: current.businessId },
        data: { isActive: false },
      });
    }

    return tx.loyaltyCardTemplate.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        maxPoints: true,
        cardColor: true,
        accentColor: true,
        textColor: true,
        isActive: true,
        businessId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  if (!template) {
    return res.status(404).json({ message: "template not found" });
  }

  res.json(template);
};

export const deleteCardTemplate = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "id is required" });
  }

  const template = await prisma.loyaltyCardTemplate.delete({
    where: { id },
    select: {
      id: true,
      title: true,
      maxPoints: true,
      cardColor: true,
      accentColor: true,
      textColor: true,
      isActive: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(template);
};

export const cardTemplateController = {
  getCardTemplateById,
  getCardTemplatesByBusinessId,
  createCardTemplate,
  updateCardTemplate,
  deleteCardTemplate,
};
