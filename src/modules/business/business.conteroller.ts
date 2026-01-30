import type { Request, Response } from "express";
import { prisma } from "../../prisma/client.js";
import { deleteImageByUrl, uploadImageBuffer } from "../../lib/gcs.js";

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
      website: true,
      locationPlaceId: true,
      locationAddress: true,
      locationLat: true,
      locationLng: true,
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
  const { name, address, website } = req.body;
  const business = await prisma.business.create({
    data: { name, address, website },
    select: {
      id: true,
      name: true,
      address: true,
      website: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json(business);
};

export const updateBusiness = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    address,
    website,
    locationPlaceId,
    locationAddress,
    locationLat,
    locationLng,
  } = req.body as {
    name?: string;
    address?: string | null;
    website?: string | null;
    locationPlaceId?: string | null;
    locationAddress?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
  };

  if (!name || typeof name !== "string") {
    return res.status(400).json({ message: "name is required" });
  }

  if (address !== undefined && address !== null && typeof address !== "string") {
    return res.status(400).json({ message: "address must be a string" });
  }

  if (website !== undefined && website !== null && typeof website !== "string") {
    return res.status(400).json({ message: "website must be a string" });
  }

  if (
    locationPlaceId !== undefined &&
    locationPlaceId !== null &&
    typeof locationPlaceId !== "string"
  ) {
    return res.status(400).json({ message: "locationPlaceId must be a string" });
  }

  if (
    locationAddress !== undefined &&
    locationAddress !== null &&
    typeof locationAddress !== "string"
  ) {
    return res.status(400).json({ message: "locationAddress must be a string" });
  }

  if (
    locationLat !== undefined &&
    locationLat !== null &&
    typeof locationLat !== "number"
  ) {
    return res.status(400).json({ message: "locationLat must be a number" });
  }

  if (
    locationLng !== undefined &&
    locationLng !== null &&
    typeof locationLng !== "number"
  ) {
    return res.status(400).json({ message: "locationLng must be a number" });
  }

  const data: {
    name: string;
    address?: string | null;
    website?: string | null;
    locationPlaceId?: string | null;
    locationAddress?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
  } = { name };

  if (address !== undefined) data.address = address;
  if (website !== undefined) data.website = website;
  if (locationPlaceId !== undefined) data.locationPlaceId = locationPlaceId;
  if (locationAddress !== undefined) data.locationAddress = locationAddress;
  if (locationLat !== undefined) data.locationLat = locationLat;
  if (locationLng !== undefined) data.locationLng = locationLng;

  const business = await prisma.business.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      address: true,
      website: true,
      locationPlaceId: true,
      locationAddress: true,
      locationLat: true,
      locationLng: true,
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

export const deleteBusinessLogo = async (req: Request, res: Response) => {
  const { id } = req.params;
  const image = await prisma.image.findFirst({
    where: { businessId: id, kind: "BUSINESS_LOGO" },
  });

  if (!image) {
    return res.status(404).json({ message: "logo not found" });
  }

  try {
    await deleteImageByUrl(image.url);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "unable to delete logo" });
  }

  await prisma.image.delete({ where: { id: image.id } });
  res.status(204).end();
};

export const getBusinessStamps = async (req: Request, res: Response) => {
  const { id } = req.params;
  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    return res.status(404).json({ message: "business not found" });
  }

  const images = await prisma.image.findMany({
    where: { businessId: id, kind: { in: ["STAMP_ON", "STAMP_OFF"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      mimeType: true,
      kind: true,
      createdAt: true,
    },
  });

  res.json({
    stampOn: images.filter((image) => image.kind === "STAMP_ON"),
    stampOff: images.filter((image) => image.kind === "STAMP_OFF"),
  });
};

export const getBusinessStampOn = async (req: Request, res: Response) => {
  const { id } = req.params;
  const image = await prisma.image.findFirst({
    where: { businessId: id, kind: "STAMP_ON" },
    orderBy: { createdAt: "desc" },
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
    orderBy: { createdAt: "desc" },
  });

  if (!image) {
    return res.status(404).end();
  }

  res.setHeader("Cache-Control", "no-store");
  res.redirect(image.url);
};

export const deleteBusinessStampImage = async (req: Request, res: Response) => {
  const { id, imageId } = req.params;

  const image = await prisma.image.findFirst({
    where: {
      id: imageId,
      businessId: id,
      kind: { in: ["STAMP_ON", "STAMP_OFF"] },
    },
  });

  if (!image) {
    return res.status(404).json({ message: "stamp image not found" });
  }

  try {
    await deleteImageByUrl(image.url);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "unable to delete stamp image" });
  }

  await prisma.image.delete({ where: { id: imageId } });
  res.status(204).end();
};

export const businessController = {
  getAllBusinesses,
  getBusinessById,
  createBusiness,
  updateBusiness,
  uploadBusinessLogo,
  getBusinessLogo,
  deleteBusinessLogo,
  uploadBusinessStampOn,
  uploadBusinessStampOff,
  getBusinessStamps,
  getBusinessStampOn,
  getBusinessStampOff,
  deleteBusinessStampImage,
};
