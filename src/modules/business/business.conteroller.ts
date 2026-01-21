import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";
import { uploadImageBuffer } from "../../lib/gcs.js";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function getImageExtension(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

export const getAllBusinesses = async (req: Request, res: Response) => {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const businessIds = businesses.map((business) => business.id);
  const images = businessIds.length
    ? await prisma.image.findMany({
        where: {
          businessId: { in: businessIds },
          kind: { in: ["BUSINESS_LOGO", "STAMP_ON", "STAMP_OFF"] },
        },
        select: { businessId: true, kind: true },
      })
    : [];

  const imageMap = new Map<string, Set<string>>();
  for (const image of images) {
    if (!image.businessId) {
      continue;
    }
    const kinds = imageMap.get(image.businessId) ?? new Set<string>();
    kinds.add(image.kind);
    imageMap.set(image.businessId, kinds);
  }

  res.json(
    businesses.map((business) => {
      const kinds = imageMap.get(business.id) ?? new Set<string>();
      return {
        ...business,
        hasLogo: kinds.has("BUSINESS_LOGO"),
        hasStampOn: kinds.has("STAMP_ON"),
        hasStampOff: kinds.has("STAMP_OFF"),
      };
    })
  );
};
export const getBusinessById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const business = await prisma.business.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!business) {
    return res.json(business);
  }

  const images = await prisma.image.findMany({
    where: {
      businessId: id,
      kind: { in: ["BUSINESS_LOGO", "STAMP_ON", "STAMP_OFF"] },
    },
    select: { kind: true },
  });
  const kinds = new Set(images.map((image) => image.kind));

  res.json({
    ...business,
    hasLogo: kinds.has("BUSINESS_LOGO"),
    hasStampOn: kinds.has("STAMP_ON"),
    hasStampOff: kinds.has("STAMP_OFF"),
  });
};

export const createBusiness = async (req: Request, res: Response) => {
  const { name, address } = req.body;
  const business = await prisma.business.create({
    data: { name, address },
    select: {
      id: true,
      name: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json(business);
};

export const updateBusiness = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, address } = req.body as { name?: string; address?: string };

  if (!name || typeof name !== "string") {
    return res.status(400).json({ message: "name is required" });
  }

  const business = await prisma.business.update({
    where: { id },
    data: { name, address },
    select: {
      id: true,
      name: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(business);
};

export const uploadBusinessLogo = async (req: Request, res: Response) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "logo file is required" });
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    return res.status(400).json({ message: "unsupported logo file type" });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return res.status(400).json({ message: "logo exceeds 3MB limit" });
  }

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  await prisma.image.deleteMany({
    where: { businessId: id, kind: "BUSINESS_LOGO" },
  });

  const logoObjectName = `business/${id}/logo-${Date.now()}.${getImageExtension(
    file.mimetype
  )}`;
  const logoUrl = await uploadImageBuffer({
    buffer: file.buffer,
    mimeType: file.mimetype,
    objectName: logoObjectName,
  });

  const image = await prisma.image.create({
    data: {
      kind: "BUSINESS_LOGO",
      mimeType: file.mimetype,
      url: logoUrl,
      businessId: id,
    },
  });

  res.status(201).json({ id: image.id });
};

export const uploadBusinessStampOn = async (req: Request, res: Response) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "stamp-on file is required" });
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    return res.status(400).json({ message: "unsupported stamp file type" });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return res.status(400).json({ message: "stamp exceeds 3MB limit" });
  }

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  await prisma.image.deleteMany({
    where: { businessId: id, kind: "STAMP_ON" },
  });

  const stampOnObjectName = `business/${id}/stamp-on-${Date.now()}.${getImageExtension(
    file.mimetype
  )}`;
  const stampOnUrl = await uploadImageBuffer({
    buffer: file.buffer,
    mimeType: file.mimetype,
    objectName: stampOnObjectName,
  });

  const image = await prisma.image.create({
    data: {
      kind: "STAMP_ON",
      mimeType: file.mimetype,
      url: stampOnUrl,
      businessId: id,
    },
  });

  res.status(201).json({ id: image.id });
};

export const uploadBusinessStampOff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "stamp-off file is required" });
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    return res.status(400).json({ message: "unsupported stamp file type" });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return res.status(400).json({ message: "stamp exceeds 3MB limit" });
  }

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  await prisma.image.deleteMany({
    where: { businessId: id, kind: "STAMP_OFF" },
  });

  const stampOffObjectName = `business/${id}/stamp-off-${Date.now()}.${getImageExtension(
    file.mimetype
  )}`;
  const stampOffUrl = await uploadImageBuffer({
    buffer: file.buffer,
    mimeType: file.mimetype,
    objectName: stampOffObjectName,
  });

  const image = await prisma.image.create({
    data: {
      kind: "STAMP_OFF",
      mimeType: file.mimetype,
      url: stampOffUrl,
      businessId: id,
    },
  });

  res.status(201).json({ id: image.id });
};

export const getBusinessLogo = async (req: Request, res: Response) => {
  const { id } = req.params;
  const image = await prisma.image.findFirst({
    where: { businessId: id, kind: "BUSINESS_LOGO" },
  });

  if (!image) {
    return res.status(404).end();
  }

  res.setHeader("Cache-Control", "no-store");
  res.redirect(image.url);
};

export const getBusinessStampOn = async (req: Request, res: Response) => {
  const { id } = req.params;
  const image = await prisma.image.findFirst({
    where: { businessId: id, kind: "STAMP_ON" },
  });

  if (!image) {
    return res.status(404).end();
  }

  res.setHeader("Cache-Control", "no-store");
  res.redirect(image.url);
};

export const getBusinessStampOff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const image = await prisma.image.findFirst({
    where: { businessId: id, kind: "STAMP_OFF" },
  });

  if (!image) {
    return res.status(404).end();
  }

  res.setHeader("Cache-Control", "no-store");
  res.redirect(image.url);
};

export const businessController = {
  getAllBusinesses,
  getBusinessById,
  createBusiness,
  updateBusiness,
  uploadBusinessLogo,
  getBusinessLogo,
  uploadBusinessStampOn,
  uploadBusinessStampOff,
  getBusinessStampOn,
  getBusinessStampOff,
};
