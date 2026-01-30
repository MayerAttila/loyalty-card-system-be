import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";
import { issuerId, walletRequest } from "../../lib/googleWallet.js";
import { generateStampHeroImages, generateStampHeroImageForCount, getStampHeroImageUrl } from "../../lib/stampHeroImage.js";
import { buildLoyaltyClassPayload } from "../../lib/walletPassStructure.js";

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
      useStampImages: true,
      stampOnImageId: true,
      stampOffImageId: true,
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
      useStampImages: true,
      stampOnImageId: true,
      stampOffImageId: true,
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
    useStampImages,
    stampOnImageId,
    stampOffImageId,
    includeLocation,
  } = req.body as {
    title?: string;
    businessId?: string;
    maxPoints?: number;
    cardColor?: string;
    accentColor?: string;
    textColor?: string;
    isActive?: boolean;
    useStampImages?: boolean;
    stampOnImageId?: string | null;
    stampOffImageId?: string | null;
    includeLocation?: boolean;
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

  if (useStampImages !== undefined && typeof useStampImages !== "boolean") {
    return res
      .status(400)
      .json({ message: "useStampImages must be a boolean" });
  }

  if (includeLocation !== undefined && typeof includeLocation !== "boolean") {
    return res.status(400).json({ message: "includeLocation must be a boolean" });
  }

  if (
    stampOnImageId !== undefined &&
    stampOnImageId !== null &&
    typeof stampOnImageId !== "string"
  ) {
    return res.status(400).json({ message: "stampOnImageId must be a string" });
  }

  if (
    stampOffImageId !== undefined &&
    stampOffImageId !== null &&
    typeof stampOffImageId !== "string"
  ) {
    return res.status(400).json({ message: "stampOffImageId must be a string" });
  }

  if (stampOnImageId) {
    const stampOn = await prisma.image.findFirst({
      where: { id: stampOnImageId, businessId, kind: "STAMP_ON" },
      select: { id: true },
    });
    if (!stampOn) {
      return res.status(400).json({ message: "invalid stampOnImageId" });
    }
  }

  if (stampOffImageId) {
    const stampOff = await prisma.image.findFirst({
      where: { id: stampOffImageId, businessId, kind: "STAMP_OFF" },
      select: { id: true },
    });
    if (!stampOff) {
      return res.status(400).json({ message: "invalid stampOffImageId" });
    }
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
          useStampImages: useStampImages ?? true,
          stampOnImageId: stampOnImageId ?? null,
          stampOffImageId: stampOffImageId ?? null,
        },
        select: {
          id: true,
          title: true,
          maxPoints: true,
          cardColor: true,
          accentColor: true,
          textColor: true,
          useStampImages: true,
          stampOnImageId: true,
          stampOffImageId: true,
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

  if (
    template &&
    template.useStampImages &&
    template.stampOnImageId &&
    template.stampOffImageId
  ) {
    const [stampOn, stampOff] = await Promise.all([
      prisma.image.findUnique({
        where: { id: template.stampOnImageId },
        select: { url: true },
      }),
      prisma.image.findUnique({
        where: { id: template.stampOffImageId },
        select: { url: true },
      }),
    ]);

    if (stampOn?.url && stampOff?.url) {
      generateStampHeroImages({
        templateId: template.id,
        maxPoints: template.maxPoints ?? 10,
        stampOnUrl: stampOn.url,
        stampOffUrl: stampOff.url,
      }).catch((error) => {
        console.warn("stamp hero image generation skipped:", error);
      });
    }
  }

  res.status(201).json(template);
};

export const updateCardTemplate = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    title,
    maxPoints,
    cardColor,
    accentColor,
    textColor,
    isActive,
    useStampImages,
    stampOnImageId,
    stampOffImageId,
    includeLocation,
  } = req.body as {
    title?: string;
    maxPoints?: number;
    cardColor?: string;
    accentColor?: string;
    textColor?: string;
    isActive?: boolean;
    useStampImages?: boolean;
    stampOnImageId?: string | null;
    stampOffImageId?: string | null;
    includeLocation?: boolean;
  };

  const data: {
    title?: string;
    maxPoints?: number;
    cardColor?: string;
    accentColor?: string;
    textColor?: string;
    isActive?: boolean;
    useStampImages?: boolean;
    stampOnImageId?: string | null;
    stampOffImageId?: string | null;
    googleWalletClassId?: string;
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

  if (useStampImages !== undefined) {
    if (typeof useStampImages !== "boolean") {
      return res
        .status(400)
        .json({ message: "useStampImages must be a boolean" });
    }
    data.useStampImages = useStampImages;
  }

  if (includeLocation !== undefined && typeof includeLocation !== "boolean") {
    return res.status(400).json({ message: "includeLocation must be a boolean" });
  }

  if (stampOnImageId !== undefined) {
    if (stampOnImageId !== null && typeof stampOnImageId !== "string") {
      return res.status(400).json({ message: "stampOnImageId must be a string" });
    }
    data.stampOnImageId = stampOnImageId;
  }

  if (stampOffImageId !== undefined) {
    if (stampOffImageId !== null && typeof stampOffImageId !== "string") {
      return res.status(400).json({ message: "stampOffImageId must be a string" });
    }
    data.stampOffImageId = stampOffImageId;
  }

  if (data.stampOnImageId) {
    const current = await prisma.loyaltyCardTemplate.findUnique({
      where: { id },
      select: { businessId: true },
    });
    if (!current) {
      return res.status(404).json({ message: "template not found" });
    }
    const stampOn = await prisma.image.findFirst({
      where: {
        id: data.stampOnImageId,
        businessId: current.businessId,
        kind: "STAMP_ON",
      },
      select: { id: true },
    });
    if (!stampOn) {
      return res.status(400).json({ message: "invalid stampOnImageId" });
    }
  }

  if (data.stampOffImageId) {
    const current = await prisma.loyaltyCardTemplate.findUnique({
      where: { id },
      select: { businessId: true },
    });
    if (!current) {
      return res.status(404).json({ message: "template not found" });
    }
    const stampOff = await prisma.image.findFirst({
      where: {
        id: data.stampOffImageId,
        businessId: current.businessId,
        kind: "STAMP_OFF",
      },
      select: { id: true },
    });
    if (!stampOff) {
      return res.status(400).json({ message: "invalid stampOffImageId" });
    }
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "no fields to update" });
  }

  let classIdToCreate: string | null = null;
  if (data.isActive) {
    const current = await prisma.loyaltyCardTemplate.findUnique({
      where: { id },
      select: { businessId: true, title: true, googleWalletClassId: true },
    });
    if (!current) {
      return res.status(404).json({ message: "template not found" });
    }

    if (!current.googleWalletClassId) {
      const business = await prisma.business.findUnique({
        where: { id: current.businessId },
        select: { name: true, locationLat: true, locationLng: true, website: true },
      });
      if (!business) {
        return res.status(404).json({ message: "business not found" });
      }

      const logo = await prisma.image.findFirst({
        where: { businessId: current.businessId, kind: "BUSINESS_LOGO" },
        select: { url: true },
      });
      if (!logo) {
        return res.status(400).json({
          message: "business logo is required for Google Wallet",
        });
      }

      const classId = `${issuerId}.${id}`;
      const programName = data.title ?? current.title;
      const classPayload = buildLoyaltyClassPayload({
        classId,
        issuerName: business.name,
        programName,
        programLogoUrl: logo.url,
        accountIdLabel: "Card ID",
        accountNameLabel: "Customer",
        reviewStatus: "underReview",
        locations:
          includeLocation !== false &&
          business.locationLat !== null &&
          business.locationLng !== null
            ? [
                {
                  latitude: business.locationLat,
                  longitude: business.locationLng,
                },
              ]
            : undefined,
        websiteUrl: business.website ?? undefined,
      });
      console.log("[wallet] class payload", JSON.stringify(classPayload, null, 2));
      const createClassRes = await walletRequest("/loyaltyClass", {
        method: "POST",
        body: classPayload,
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

      classIdToCreate = classId;
    }
  }

  if (classIdToCreate) {
    data.googleWalletClassId = classIdToCreate;
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
        useStampImages: true,
        stampOnImageId: true,
        stampOffImageId: true,
        isActive: true,
        businessId: true,
        googleWalletClassId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  if (!template) {
    return res.status(404).json({ message: "template not found" });
  }

  if (template.googleWalletClassId) {
    const business = await prisma.business.findUnique({
      where: { id: template.businessId },
      select: { locationLat: true, locationLng: true },
    });

    if (!business) {
      return res.status(404).json({ message: "business not found" });
    }

    const locations =
      includeLocation !== false &&
      business.locationLat !== null &&
      business.locationLng !== null
        ? [
            {
              latitude: business.locationLat,
              longitude: business.locationLng,
            },
          ]
        : [];

    await walletRequest(
      `/loyaltyClass/${encodeURIComponent(
        template.googleWalletClassId
      )}?updateMask=locations`,
      {
        method: "PATCH",
        body: { locations },
      }
    );
  }

  const shouldRegenerate =
    data.maxPoints !== undefined ||
    data.stampOnImageId !== undefined ||
    data.stampOffImageId !== undefined ||
    data.useStampImages !== undefined;

  if (
    shouldRegenerate &&
    template.useStampImages &&
    template.stampOnImageId &&
    template.stampOffImageId
  ) {
    const [stampOn, stampOff] = await Promise.all([
      prisma.image.findUnique({
        where: { id: template.stampOnImageId },
        select: { url: true },
      }),
      prisma.image.findUnique({
        where: { id: template.stampOffImageId },
        select: { url: true },
      }),
    ]);

    if (stampOn?.url && stampOff?.url) {
      generateStampHeroImages({
        templateId: template.id,
        maxPoints: template.maxPoints ?? 10,
        stampOnUrl: stampOn.url,
        stampOffUrl: stampOff.url,
      }).catch((error) => {
        console.warn("stamp hero image generation skipped:", error);
      });
    }
  }

  res.json(template);
};

export const deleteCardTemplate = async (req: Request, res: Response) => {
  const { id } = req.params;
  const forceDelete = req.query.force === "1";

  if (!id) {
    return res.status(400).json({ message: "id is required" });
  }

  const existingCards = await prisma.customerLoyaltyCard.findMany({
    where: { loyaltyCardTemplateId: id },
    select: { id: true },
  });

  if (existingCards.length > 0 && !forceDelete) {
    return res.status(409).json({
      message: "template is in use by existing customer cards",
      hint: "pass ?force=1 to delete cards and cycles",
    });
  }

  if (existingCards.length > 0 && forceDelete) {
    const cardIds = existingCards.map((card) => card.id);
    await prisma.$transaction([
      prisma.stampingLog.deleteMany({
        where: {
          customerLoyaltyCardCycle: {
            customerLoyaltyCardId: { in: cardIds },
          },
        },
      }),
      prisma.customerLoyaltyCardCycle.deleteMany({
        where: { customerLoyaltyCardId: { in: cardIds } },
      }),
      prisma.customerLoyaltyCard.deleteMany({
        where: { id: { in: cardIds } },
      }),
    ]);
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
      useStampImages: true,
      stampOnImageId: true,
      stampOffImageId: true,
      isActive: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(template);
};

export const generateTemplateHeroImage = async (
  req: Request,
  res: Response
) => {
  console.log("[hero-image] endpoint hit", {
    id: req.params.id,
    count: req.query.count,
  });
  const { id } = req.params;
  const countParam = req.query.count;
  const maxPointsParam = req.query.maxPoints;
  const stampRowsParam = req.query.stampRows;
  const count = typeof countParam === "string" ? Number.parseInt(countParam, 10) : 0;
  const maxPointsOverride =
    typeof maxPointsParam === "string" ? Number.parseInt(maxPointsParam, 10) : undefined;
  const stampRowsOverride =
    typeof stampRowsParam === "string" ? Number.parseInt(stampRowsParam, 10) : undefined;

  if (!id) {
    return res.status(400).json({ message: "id is required" });
  }

  const template = await prisma.loyaltyCardTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      maxPoints: true,
      useStampImages: true,
      stampOnImageId: true,
      stampOffImageId: true,
    },
  });

  if (!template) {
    return res.status(404).json({ message: "template not found" });
  }

  if (!template.useStampImages || !template.stampOnImageId || !template.stampOffImageId) {
    return res.status(400).json({ message: "template has no stamp images" });
  }

  const [stampOn, stampOff] = await Promise.all([
    prisma.image.findUnique({
      where: { id: template.stampOnImageId },
      select: { url: true },
    }),
    prisma.image.findUnique({
      where: { id: template.stampOffImageId },
      select: { url: true },
    }),
  ]);

  if (!stampOn?.url || !stampOff?.url) {
    return res.status(400).json({ message: "stamp image URLs missing" });
  }

  try {
  await generateStampHeroImageForCount(
    {
      templateId: template.id,
      maxPoints: maxPointsOverride ?? template.maxPoints ?? 10,
      stampRows: stampRowsOverride,
      stampOnUrl: stampOn.url,
      stampOffUrl: stampOff.url,
    },
    Number.isNaN(count) ? 0 : count
  );
  } catch (error) {
    console.error("[hero-image] generation failed", error);
    return res.status(500).json({ message: "hero image generation failed" });
  }

  return res.json({
    url: getStampHeroImageUrl(template.id, Number.isNaN(count) ? 0 : count),
  });
};

export const cardTemplateController = {
  getCardTemplateById,
  getCardTemplatesByBusinessId,
  createCardTemplate,
  updateCardTemplate,
  deleteCardTemplate,
  generateTemplateHeroImage,
};
