import type { Request, Response } from "express";
import { getSession } from "@auth/express";
import { authConfig } from "../../auth.js";
import { prisma } from "../../prisma/client.js";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function resolveLimit(raw: unknown) {
  if (typeof raw !== "string") return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export const getStampingLogsForBusiness = async (
  req: Request,
  res: Response
) => {
  const session = await getSession(req, authConfig);
  if (!session?.user) {
    return res.status(401).json({ message: "unauthorized" });
  }

  const user = session.user as {
    id?: string;
    businessId?: string;
    role?: string;
    approved?: boolean;
  };

  if (!user.businessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  if (user.approved === false) {
    return res.status(403).json({ message: "user not approved" });
  }

  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return res.status(403).json({ message: "insufficient permissions" });
  }

  const limit = resolveLimit(req.query.limit);

  const logs = await prisma.stampingLog.findMany({
    where: {
      customerLoyaltyCardCycle: {
        customerLoyaltyCard: {
          template: {
            businessId: user.businessId,
          },
        },
      },
    },
    orderBy: { stampedAt: "desc" },
    take: limit,
    include: {
      stampedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      customerLoyaltyCardCycle: {
        select: {
          id: true,
          cycleNumber: true,
          stampCount: true,
          customerLoyaltyCard: {
            select: {
              id: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              template: {
                select: {
                  id: true,
                  title: true,
                  maxPoints: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const payload = logs.map((log) => ({
    id: log.id,
    stampedAt: log.stampedAt,
    stampedBy: log.stampedBy,
    cardId: log.customerLoyaltyCardCycle.customerLoyaltyCard.id,
    cycleId: log.customerLoyaltyCardCycle.id,
    cycleNumber: log.customerLoyaltyCardCycle.cycleNumber,
    stampCount: log.customerLoyaltyCardCycle.stampCount,
    addedStamps: log.addedStamps,
    stampCountAfter: log.stampCountAfter,
    cardCompleted: log.cardCompleted,
    customer: log.customerLoyaltyCardCycle.customerLoyaltyCard.customer,
    cardTemplate: log.customerLoyaltyCardCycle.customerLoyaltyCard.template,
  }));

  return res.json(payload);
};

export const stampingLogControllers = {
  getStampingLogsForBusiness,
};
