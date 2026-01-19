import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";

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
      businessId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(templates);
};

export const createCardTemplate = async (req: Request, res: Response) => {
  const { title, businessId, maxPoints, cardColor, accentColor, textColor } =
    req.body as {
      title?: string;
      businessId?: string;
      maxPoints?: number;
      cardColor?: string;
      accentColor?: string;
      textColor?: string;
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

  const template = await prisma.loyaltyCardTemplate.create({
    data: {
      title,
      businessId,
      maxPoints,
      cardColor,
      accentColor,
      textColor,
    },
    select: {
      id: true,
      title: true,
      maxPoints: true,
      cardColor: true,
      accentColor: true,
      textColor: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json(template);
};

export const updateCardTemplate = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, maxPoints, cardColor, accentColor, textColor } = req.body as {
    title?: string;
    maxPoints?: number;
    cardColor?: string;
    accentColor?: string;
    textColor?: string;
  };

  const data: {
    title?: string;
    maxPoints?: number;
    cardColor?: string;
    accentColor?: string;
    textColor?: string;
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

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "no fields to update" });
  }

  const template = await prisma.loyaltyCardTemplate.update({
    where: { id },
    data,
    select: {
      id: true,
      title: true,
      maxPoints: true,
      cardColor: true,
      accentColor: true,
      textColor: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

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
