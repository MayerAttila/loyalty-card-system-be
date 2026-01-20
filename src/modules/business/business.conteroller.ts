import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

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

  res.json(businesses);
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

  res.json(business);
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
    return res.status(400).json({ message: "logo exceeds 2MB limit" });
  }

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  await prisma.image.deleteMany({
    where: { businessId: id, kind: "BUSINESS_LOGO" },
  });

  const image = await prisma.image.create({
    data: {
      kind: "BUSINESS_LOGO",
      mimeType: file.mimetype,
      data: new Uint8Array(file.buffer),
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
    return res.status(400).json({ message: "stamp exceeds 2MB limit" });
  }

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  await prisma.image.deleteMany({
    where: { businessId: id, kind: "STAMP_ON" },
  });

  const image = await prisma.image.create({
    data: {
      kind: "STAMP_ON",
      mimeType: file.mimetype,
      data: new Uint8Array(file.buffer),
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
    return res.status(400).json({ message: "stamp exceeds 2MB limit" });
  }

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  await prisma.image.deleteMany({
    where: { businessId: id, kind: "STAMP_OFF" },
  });

  const image = await prisma.image.create({
    data: {
      kind: "STAMP_OFF",
      mimeType: file.mimetype,
      data: new Uint8Array(file.buffer),
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

  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "no-store");
  res.send(image.data);
};

export const getBusinessStampOn = async (req: Request, res: Response) => {
  const { id } = req.params;
  const image = await prisma.image.findFirst({
    where: { businessId: id, kind: "STAMP_ON" },
  });

  if (!image) {
    return res.status(404).end();
  }

  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "no-store");
  res.send(image.data);
};

export const getBusinessStampOff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const image = await prisma.image.findFirst({
    where: { businessId: id, kind: "STAMP_OFF" },
  });

  if (!image) {
    return res.status(404).end();
  }

  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "no-store");
  res.send(image.data);
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
