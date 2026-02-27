import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getSession } from "@auth/express";
import type { UserRole } from "@prisma/client";
import { authConfig } from "../../auth.js";
import { env } from "../../config/env.js";

export type SessionUser = {
  id?: string;
  email?: string;
  businessId?: string;
  role?: UserRole | string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: SessionUser;
    }
  }
}

async function loadSessionUser(req: Request) {
  if (req.authUser) {
    return req.authUser;
  }
  const session = await getSession(req, authConfig);
  const user = (session?.user as SessionUser | undefined) ?? null;
  if (user) {
    req.authUser = user;
  }
  return user;
}

export const requireSession: RequestHandler = async (req, res, next) => {
  try {
    const user = await loadSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "unauthorized" });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireBusinessMember: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const user = await loadSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "unauthorized" });
    }
    if (!user.businessId) {
      return res.status(403).json({ message: "invalid session" });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRoles = (...roles: UserRole[]): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await loadSessionUser(req);
      if (!user) {
        return res.status(401).json({ message: "unauthorized" });
      }
      if (!user.role || !roles.includes(user.role as UserRole)) {
        return res.status(403).json({ message: "insufficient permissions" });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requirePlatformAdmin: RequestHandler = async (req, res, next) => {
  try {
    const user = await loadSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const allowlist = env.PLATFORM_ADMIN_EMAILS;
    if (!allowlist.length) {
      return res
        .status(403)
        .json({ message: "platform admin allowlist not configured" });
    }

    const email = user.email?.trim().toLowerCase();
    if (!email || !allowlist.includes(email)) {
      return res.status(403).json({ message: "platform admin access required" });
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const requireParamBusinessMatch = (
  paramName = "businessId"
): RequestHandler => {
  return (req, res, next) => {
    const sessionBusinessId = req.authUser?.businessId;
    const requestedBusinessId = req.params[paramName];

    if (!sessionBusinessId) {
      return res.status(403).json({ message: "invalid session" });
    }

    if (!requestedBusinessId || requestedBusinessId !== sessionBusinessId) {
      return res.status(403).json({ message: "forbidden business access" });
    }

    next();
  };
};

export const requireBodyBusinessMatch = (
  fieldName = "businessId"
): RequestHandler => {
  return (req, res, next) => {
    const sessionBusinessId = req.authUser?.businessId;
    const requestedBusinessId = (req.body as Record<string, unknown> | undefined)?.[
      fieldName
    ];

    if (!sessionBusinessId) {
      return res.status(403).json({ message: "invalid session" });
    }

    if (
      typeof requestedBusinessId !== "string" ||
      requestedBusinessId !== sessionBusinessId
    ) {
      return res.status(403).json({ message: "forbidden business access" });
    }

    next();
  };
};
