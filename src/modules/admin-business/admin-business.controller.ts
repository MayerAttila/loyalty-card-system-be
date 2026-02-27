import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client.js";

const normalizeStatus = (value: string | null | undefined) => {
  const next = (value ?? "").trim();
  return next || "NONE";
};

const parsePositiveInt = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const parseSearch = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const listBusinesses = async (_req: Request, res: Response) => {
  try {
    const businesses = await prisma.business.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        referralLink: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            interval: true,
            stripePriceId: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
            cancelAtPeriodEnd: true,
            updatedAt: true,
          },
        },
        employees: {
          where: { role: "OWNER" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const result = businesses.map((business) => {
      const owner = business.employees[0] ?? null;
      const subscription = business.subscription;
      return {
        id: business.id,
        name: business.name,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt,
        owner: owner
          ? {
              id: owner.id,
              name: owner.name,
              email: owner.email,
            }
          : null,
        referral: business.referralLink
          ? {
              id: business.referralLink.id,
              code: business.referralLink.code,
              status: business.referralLink.status,
            }
          : null,
        subscription: subscription
          ? {
              id: subscription.id,
              status: normalizeStatus(subscription.status),
              interval: subscription.interval,
              stripePriceId: subscription.stripePriceId,
              currentPeriodEnd: subscription.currentPeriodEnd,
              trialEndsAt: subscription.trialEndsAt,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
              updatedAt: subscription.updatedAt,
            }
          : {
              id: null,
              status: "NONE",
              interval: null,
              stripePriceId: null,
              currentPeriodEnd: null,
              trialEndsAt: null,
              cancelAtPeriodEnd: false,
              updatedAt: null,
            },
      };
    });

    return res.json(result);
  } catch (error) {
    console.error("listBusinesses failed", error);
    return res.status(500).json({ message: "unable to load businesses" });
  }
};

export const listSubscriptionHistory = async (req: Request, res: Response) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = Math.min(parsePositiveInt(req.query.pageSize, 20), 100);
    const skip = (page - 1) * pageSize;
    const q = parseSearch(req.query.q);
    const businessId = parseSearch(req.query.businessId);

    const where: Prisma.SubscriptionHistoryWhereInput = {};

    if (businessId) {
      where.businessId = businessId;
    }

    if (q) {
      where.OR = [
        { source: { contains: q, mode: "insensitive" } },
        { eventType: { contains: q, mode: "insensitive" } },
        { stripeSubscriptionId: { contains: q, mode: "insensitive" } },
        { previousStatus: { contains: q, mode: "insensitive" } },
        { nextStatus: { contains: q, mode: "insensitive" } },
        { previousPriceId: { contains: q, mode: "insensitive" } },
        { nextPriceId: { contains: q, mode: "insensitive" } },
        { business: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, history] = await Promise.all([
      prisma.subscriptionHistory.count({ where }),
      prisma.subscriptionHistory.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize,
        select: {
          id: true,
          businessId: true,
          source: true,
          eventType: true,
          stripeSubscriptionId: true,
          previousStatus: true,
          nextStatus: true,
          previousPriceId: true,
          nextPriceId: true,
          previousInterval: true,
          nextInterval: true,
          currentPeriodEnd: true,
          trialEndsAt: true,
          cancelAtPeriodEnd: true,
          createdAt: true,
          business: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    return res.json({
      items: history.map((entry) => ({
        id: entry.id,
        business: entry.business,
        source: entry.source,
        eventType: entry.eventType,
        stripeSubscriptionId: entry.stripeSubscriptionId,
        previousStatus: normalizeStatus(entry.previousStatus),
        nextStatus: normalizeStatus(entry.nextStatus),
        previousPriceId: entry.previousPriceId,
        nextPriceId: entry.nextPriceId,
        previousInterval: entry.previousInterval,
        nextInterval: entry.nextInterval,
        currentPeriodEnd: entry.currentPeriodEnd,
        trialEndsAt: entry.trialEndsAt,
        cancelAtPeriodEnd: entry.cancelAtPeriodEnd,
        createdAt: entry.createdAt,
      })),
      page,
      pageSize,
      total,
    });
  } catch (error) {
    console.error("listSubscriptionHistory failed", error);
    return res
      .status(500)
      .json({ message: "unable to load subscription history" });
  }
};

export const adminBusinessController = {
  listBusinesses,
  listSubscriptionHistory,
};
