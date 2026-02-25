import type { Request, Response } from "express";
import type { ReferralLinkStatus } from "@prisma/client";
import { prisma } from "../../prisma/client.js";

const REFERRAL_LINK_STATUSES: ReferralLinkStatus[] = ["ACTIVE", "INACTIVE"];

const normalizeReferralCode = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "");

const normalizeLandingPath = (value: string | undefined) => {
  const raw = (value ?? "").trim();
  if (!raw) return "/register";
  return raw.startsWith("/") ? raw : `/${raw}`;
};

const isValidLandingPath = (value: string) => /^[-_/A-Za-z0-9]+$/.test(value);

export const createReferralLink = async (req: Request, res: Response) => {
  const { code, status, landingPath } = req.body as {
    code?: string;
    status?: ReferralLinkStatus | string;
    landingPath?: string;
  };

  if (!code || typeof code !== "string") {
    return res.status(400).json({ message: "code is required" });
  }

  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) {
    return res.status(400).json({ message: "invalid referral code" });
  }

  const nextStatus =
    typeof status === "string" ? (status.toUpperCase() as ReferralLinkStatus) : "ACTIVE";
  if (!REFERRAL_LINK_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ message: "invalid referral link status" });
  }

  const nextLandingPath =
    typeof landingPath === "string" ? normalizeLandingPath(landingPath) : "/register";
  if (!isValidLandingPath(nextLandingPath)) {
    return res.status(400).json({ message: "invalid landing path" });
  }

  try {
    const referralLink = await prisma.referralLink.create({
      data: {
        code: normalizedCode,
        status: nextStatus,
        landingPath: nextLandingPath,
      },
      select: {
        id: true,
        code: true,
        status: true,
        landingPath: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json(referralLink);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return res.status(409).json({ message: "referral code already exists" });
    }
    console.error("createReferralLink failed", error);
    return res.status(500).json({ message: "unable to create referral link" });
  }
};

export const listReferralLinks = async (_req: Request, res: Response) => {
  const links = await prisma.referralLink.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      status: true,
      landingPath: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(links);
};

export const updateReferralLink = async (req: Request, res: Response) => {
  const { id } = req.params as { id?: string };
  const { code, status, landingPath } = req.body as {
    code?: string;
    status?: ReferralLinkStatus | string;
    landingPath?: string;
  };

  if (!id || typeof id !== "string") {
    return res.status(400).json({ message: "id is required" });
  }

  const data: {
    code?: string;
    status?: ReferralLinkStatus;
    landingPath?: string;
  } = {};

  if (typeof code !== "undefined") {
    if (typeof code !== "string") {
      return res.status(400).json({ message: "invalid referral code" });
    }
    const normalizedCode = normalizeReferralCode(code);
    if (!normalizedCode) {
      return res.status(400).json({ message: "invalid referral code" });
    }
    data.code = normalizedCode;
  }

  if (typeof status !== "undefined") {
    if (typeof status !== "string") {
      return res.status(400).json({ message: "invalid referral link status" });
    }
    const nextStatus = status.toUpperCase() as ReferralLinkStatus;
    if (!REFERRAL_LINK_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ message: "invalid referral link status" });
    }
    data.status = nextStatus;
  }

  if (typeof landingPath !== "undefined") {
    if (typeof landingPath !== "string") {
      return res.status(400).json({ message: "invalid landing path" });
    }
    const nextLandingPath = normalizeLandingPath(landingPath);
    if (!isValidLandingPath(nextLandingPath)) {
      return res.status(400).json({ message: "invalid landing path" });
    }
    data.landingPath = nextLandingPath;
  }

  if (!Object.keys(data).length) {
    return res.status(400).json({ message: "no changes provided" });
  }

  try {
    const referralLink = await prisma.referralLink.update({
      where: { id },
      data,
      select: {
        id: true,
        code: true,
        status: true,
        landingPath: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json(referralLink);
  } catch (error) {
    const prismaCode = (error as { code?: string }).code;
    if (prismaCode === "P2025") {
      return res.status(404).json({ message: "referral link not found" });
    }
    if (prismaCode === "P2002") {
      return res.status(409).json({ message: "referral code already exists" });
    }
    console.error("updateReferralLink failed", error);
    return res.status(500).json({ message: "unable to update referral link" });
  }
};

export const deleteReferralLink = async (req: Request, res: Response) => {
  const { id } = req.params as { id?: string };
  if (!id || typeof id !== "string") {
    return res.status(400).json({ message: "id is required" });
  }

  try {
    await prisma.referralLink.delete({
      where: { id },
    });
    return res.json({ message: "referral link deleted" });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return res.status(404).json({ message: "referral link not found" });
    }
    console.error("deleteReferralLink failed", error);
    return res.status(500).json({ message: "unable to delete referral link" });
  }
};

export const referralLinkController = {
  createReferralLink,
  listReferralLinks,
  updateReferralLink,
  deleteReferralLink,
};
