import type { Request, Response } from "express";
import { getSession } from "@auth/express";
import { NotificationChannel, NotificationLogStatus } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { authConfig } from "../../auth.js";
import { createSaveJwt, issuerId, walletRequest } from "../../lib/googleWallet.js";
import { getStampHeroImageUrl } from "../../lib/stampHeroImage.js";
import { createAppleWalletPass } from "../../lib/appleWallet.js";
import {
  getAppleWalletAuthToken,
  getAppleWalletSerialLastUpdated,
  getAppleWalletWebServiceUrl,
  isAuthorizedAppleWalletRequest,
  isSupportedAppleWalletPassType,
  listAppleWalletSerialNumbers,
  notifyAppleWalletPassUpdated,
  registerAppleWalletDevice,
  unregisterAppleWalletDevice,
} from "../../lib/appleWalletUpdateFlow.js";
import {
  buildStampImageModule,
  buildStampTextModules,
  buildLoyaltyClassPayload,
  buildLoyaltyObjectPayload,
} from "../../lib/walletPassStructure.js";

const resolvePassTypeIdentifier = () =>
  process.env.APPLE_WALLET_PASS_TYPE_ID?.trim() ?? "";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const normalizeHttpsUrl = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    const cleanPath = parsed.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
    parsed.pathname = cleanPath || "/";
    return trimTrailingSlash(parsed.toString());
  } catch {
    return null;
  }
};

const buildAppleWalletPassBundle = async (cardId: string, req?: Request) => {
  const card = await prisma.customerLoyaltyCard.findUnique({
    where: { id: cardId },
    include: {
      customer: {
        select: {
          name: true,
          email: true,
        },
      },
      template: {
        select: {
          id: true,
          template: true,
          text1: true,
          text2: true,
          maxPoints: true,
          cardColor: true,
          business: {
            select: {
              name: true,
              website: true,
              images: {
                where: { kind: "BUSINESS_LOGO" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      },
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
        select: {
          stampCount: true,
          cycleNumber: true,
        },
      },
      notificationLogs: {
        where: {
          channel: NotificationChannel.APPLE_WALLET,
          status: {
            in: [NotificationLogStatus.QUEUED, NotificationLogStatus.SENT],
          },
        },
        orderBy: [{ attemptedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          notification: {
            select: {
              message: true,
            },
          },
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  const latestCycle = card.customerLoyaltyCardCycles[0];
  const stampCount = latestCycle?.stampCount ?? 0;
  const cycleNumber = latestCycle?.cycleNumber ?? 1;
  const rewardsEarned = Math.max(cycleNumber - 1, 0);
  const logoImageUrl = card.template.business.images[0]?.url ?? null;
  const stripImageUrl = getStampHeroImageUrl(card.template.id, stampCount);
  const authenticationToken = getAppleWalletAuthToken() ?? undefined;
  const configuredWebServiceUrl = getAppleWalletWebServiceUrl();
  const requestBaseUrl =
    req && req.get("host") ? `${req.protocol}://${req.get("host")}` : null;
  const requestWebServiceUrl = requestBaseUrl
    ? normalizeHttpsUrl(
        `${trimTrailingSlash(requestBaseUrl)}/user-loyalty-card/apple-wallet`,
      )
    : null;
  const webServiceUrl =
    configuredWebServiceUrl ?? requestWebServiceUrl ?? undefined;
  const latestAppleNotification = card.notificationLogs[0]?.notification;

  const pass = await createAppleWalletPass({
    cardId: card.id,
    serialNumber: card.id,
    barcodeValue: card.id,
    customerName: card.customer.name,
    customerEmail: card.customer.email,
    programName: card.template.text2 ?? card.template.template,
    issuerName: card.template.text1 ?? card.template.business.name,
    businessName: card.template.business.name,
    templateName: card.template.template,
    stampCount,
    maxPoints: card.template.maxPoints,
    rewardsEarned,
    cardColor: card.template.cardColor,
    websiteUrl: card.template.business.website,
    logoImageUrl,
    stripImageUrl,
    authenticationToken,
    webServiceUrl,
    notificationTitle: null,
    notificationMessage: latestAppleNotification?.message ?? null,
  });

  return pass;
};

export const getCardById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const sessionBusinessId = req.authUser?.businessId;

  const card = await prisma.customerLoyaltyCard.findUnique({
    where: { id },
    include: {
      customer: {
        select: { name: true, email: true },
      },
      template: {
        select: {
          id: true,
          template: true,
          maxPoints: true,
          cardColor: true,
          businessId: true,
        },
      },
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!card || (sessionBusinessId && card.template.businessId !== sessionBusinessId)) {
    return res.status(404).json({ message: "card not found" });
  }

  res.json(card);
};

export const getCardsByCustomerId = async (req: Request, res: Response) => {
  const { customerId } = req.params;
  const sessionBusinessId = req.authUser?.businessId;
  if (!sessionBusinessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  const cards = await prisma.customerLoyaltyCard.findMany({
    where: {
      customerId,
      customer: {
        businessId: sessionBusinessId,
      },
    },
    include: {
      template: {
        select: {
          id: true,
          template: true,
          maxPoints: true,
          cardColor: true,
          businessId: true,
        },
      },
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(cards);
};

export const createCustomerCard = async (req: Request, res: Response) => {
  const { customerId, loyaltyCardTemplateId } = req.body as {
    customerId?: string;
    loyaltyCardTemplateId?: string;
  };
  const sessionBusinessId = req.authUser?.businessId;
  if (!sessionBusinessId) {
    return res.status(403).json({ message: "invalid session" });
  }

  if (!customerId || typeof customerId !== "string") {
    return res.status(400).json({ message: "customerId is required" });
  }

  if (!loyaltyCardTemplateId || typeof loyaltyCardTemplateId !== "string") {
    return res
      .status(400)
      .json({ message: "loyaltyCardTemplateId is required" });
  }

  const [customer, template] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, businessId: true },
    }),
    prisma.loyaltyCardTemplate.findUnique({
      where: { id: loyaltyCardTemplateId },
      select: { id: true, businessId: true },
    }),
  ]);

  if (!customer) {
    return res.status(404).json({ message: "customer not found" });
  }

  if (!template) {
    return res.status(404).json({ message: "card template not found" });
  }

  if (customer.businessId !== template.businessId) {
    return res.status(400).json({ message: "business mismatch" });
  }
  if (
    customer.businessId !== sessionBusinessId ||
    template.businessId !== sessionBusinessId
  ) {
    return res.status(403).json({ message: "forbidden business access" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const card = await tx.customerLoyaltyCard.create({
        data: { customerId, loyaltyCardTemplateId },
      });
      const cycle = await tx.customerLoyaltyCardCycle.create({
        data: {
          customerLoyaltyCardId: card.id,
          cycleNumber: 1,
          stampCount: 0,
        },
      });

      return { card, cycle };
    });

    return res.status(201).json(result);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return res.status(409).json({ message: "card already exists" });
    }
    throw error;
  }
};

export const getGoogleWalletSaveLink = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "id is required" });
  }

  const card = await prisma.customerLoyaltyCard.findUnique({
    where: { id },
    include: {
      customer: true,
      template: {
        select: {
          id: true,
          template: true,
          text1: true,
          text2: true,
          maxPoints: true,
          cardColor: true,
          businessId: true,
          googleWalletClassId: true,
          business: true,
        },
      },
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!card) {
    return res.status(404).json({ message: "card not found" });
  }

  const classId =
    card.template.googleWalletClassId ?? `${issuerId}.${card.template.id}`;
  const objectId = card.googleWalletObjectId ?? `${issuerId}.${card.id}`;

  const classRes = await walletRequest(
    `/loyaltyClass/${encodeURIComponent(classId)}`
  );
  if (classRes.status === 404) {
    const logo = await prisma.image.findFirst({
      where: { businessId: card.template.businessId, kind: "BUSINESS_LOGO" },
      select: { url: true },
    });
    if (!logo) {
      return res.status(400).json({
        message: "business logo is required for Google Wallet",
      });
    }

    const resolvedIssuerName = card.template.text1 ?? "";
    const resolvedProgramName = card.template.text2 ?? "";
    const classPayload = buildLoyaltyClassPayload({
      classId,
      issuerName: resolvedIssuerName,
      programName: resolvedProgramName,
      programLogoUrl: logo.url,
      accountIdLabel: "Card ID",
      accountNameLabel: "Customer",
      reviewStatus: "underReview",
      hexBackgroundColor: card.template.cardColor,
      locations:
        card.template.business.locationLat !== null &&
        card.template.business.locationLng !== null
          ? [
              {
                latitude: card.template.business.locationLat,
                longitude: card.template.business.locationLng,
              },
            ]
          : undefined,
      websiteUrl: card.template.business.website ?? undefined,
    });
    console.log("[wallet] class payload", JSON.stringify(classPayload, null, 2));
    const createClassRes = await walletRequest("/loyaltyClass", {
      method: "POST",
      body: buildLoyaltyClassPayload({
        classId,
        issuerName: resolvedIssuerName,
        programName: resolvedProgramName,
        programLogoUrl: logo.url,
        accountIdLabel: "Card ID",
        accountNameLabel: "Customer",
        reviewStatus: "underReview",
        hexBackgroundColor: card.template.cardColor,
        locations:
          card.template.business.locationLat !== null &&
          card.template.business.locationLng !== null
            ? [
                {
                  latitude: card.template.business.locationLat,
                  longitude: card.template.business.locationLng,
                },
              ]
            : undefined,
        websiteUrl: card.template.business.website ?? undefined,
      }),
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
    if (!card.template.googleWalletClassId) {
      await prisma.loyaltyCardTemplate.update({
        where: { id: card.template.id },
        data: { googleWalletClassId: classId },
      });
    }
  } else if (!classRes.ok) {
    const errorText = await classRes.text();
    let errorDetails: unknown = errorText;
    try {
      errorDetails = JSON.parse(errorText);
    } catch {
      // keep raw text
    }
    return res.status(classRes.status).json({
      message: "failed to fetch loyalty class",
      details: errorDetails,
    });
  }

  // Keep existing classes visually aligned with current template behavior.
  try {
    const classUpdateRes = await walletRequest(
      `/loyaltyClass/${encodeURIComponent(classId)}?updateMask=programName`,
      {
        method: "PATCH",
        body: {
          programName: "\u00A0",
        },
      },
    );
    if (!classUpdateRes.ok) {
      const updateText = await classUpdateRes.text();
      const approvedStatusMessage =
        "Invalid review status Optional[APPROVED]";
      const isExpectedApprovedClassError =
        classUpdateRes.status === 400 &&
        updateText.includes(approvedStatusMessage);
      if (!isExpectedApprovedClassError) {
        console.warn("[wallet] class programName update failed", {
          status: classUpdateRes.status,
          details: updateText,
        });
      }
    }
  } catch (error) {
    console.warn("[wallet] class programName update error", error);
  }

  const objectRes = await walletRequest(
    `/loyaltyObject/${encodeURIComponent(objectId)}`
  );
  if (objectRes.status === 404) {
    const stampCount = card.customerLoyaltyCardCycles[0]?.stampCount ?? 0;
    const heroImageUrl = getStampHeroImageUrl(card.template.id, stampCount);
    const createObjectRes = await walletRequest("/loyaltyObject", {
      method: "POST",
      body: buildLoyaltyObjectPayload({
        objectId,
        classId,
        state: "ACTIVE",
        accountId: card.id,
        accountName: card.customer.name,
        barcodeValue: card.id,
        barcodeAltText: " ",
        imageUrl: heroImageUrl,
        stampCount,
        maxPoints: card.template.maxPoints,
        rewards: 0,
        customerEmail: card.customer.email,
      }),
    });
    if (!createObjectRes.ok) {
      const errorText = await createObjectRes.text();
      let errorDetails: unknown = errorText;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        // keep raw text
      }
      return res.status(createObjectRes.status).json({
        message: "failed to create loyalty object",
        details: errorDetails,
      });
    }
    if (!card.googleWalletObjectId) {
      await prisma.customerLoyaltyCard.update({
        where: { id: card.id },
        data: { googleWalletObjectId: objectId },
      });
    }
  } else if (!objectRes.ok) {
    const errorText = await objectRes.text();
    let errorDetails: unknown = errorText;
    try {
      errorDetails = JSON.parse(errorText);
    } catch {
      // keep raw text
    }
    return res.status(objectRes.status).json({
      message: "failed to fetch loyalty object",
      details: errorDetails,
    });
  }

  const saveJwt = createSaveJwt(objectId, classId);
  const saveUrl = `https://pay.google.com/gp/v/save/${saveJwt}`;

  res.json({ saveUrl, classId, objectId });
};

export const getAppleWalletPass = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: "id is required" });
  }

  try {
    const pass = await buildAppleWalletPassBundle(id, req);
    if (!pass) {
      return res.status(404).json({ message: "card not found" });
    }

    res.setHeader("Content-Type", pass.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${pass.fileName}"`,
    );
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(pass.buffer);
  } catch (error) {
    console.error("[apple-wallet] pass generation failed", error);
    return res
      .status(500)
      .json({ message: "unable to generate Apple Wallet pass" });
  }
};

export const registerAppleWalletPass = async (req: Request, res: Response) => {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } =
    req.params;
  const { pushToken } = req.body as { pushToken?: string };

  if (
    !deviceLibraryIdentifier ||
    !passTypeIdentifier ||
    !serialNumber ||
    !pushToken
  ) {
    return res.status(400).json({ message: "missing registration fields" });
  }

  if (!isSupportedAppleWalletPassType(passTypeIdentifier)) {
    return res.status(404).json({ message: "pass type not found" });
  }

  if (!isAuthorizedAppleWalletRequest(req.headers.authorization)) {
    return res.status(401).json({ message: "unauthorized" });
  }

  const card = await prisma.customerLoyaltyCard.findUnique({
    where: { id: serialNumber },
    select: { id: true },
  });
  if (!card) {
    return res.status(404).json({ message: "card not found" });
  }

  const result = await registerAppleWalletDevice({
    deviceLibraryIdentifier,
    passTypeIdentifier,
    serialNumber,
    cardId: card.id,
    pushToken,
  });

  return res.status(result.created ? 201 : 200).json({});
};

export const unregisterAppleWalletPass = async (
  req: Request,
  res: Response,
) => {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } =
    req.params;

  if (!deviceLibraryIdentifier || !passTypeIdentifier || !serialNumber) {
    return res.status(400).json({ message: "missing registration fields" });
  }

  if (!isSupportedAppleWalletPassType(passTypeIdentifier)) {
    return res.status(404).json({ message: "pass type not found" });
  }

  if (!isAuthorizedAppleWalletRequest(req.headers.authorization)) {
    return res.status(401).json({ message: "unauthorized" });
  }

  await unregisterAppleWalletDevice({
    deviceLibraryIdentifier,
    passTypeIdentifier,
    serialNumber,
  });

  return res.status(200).json({});
};

export const listAppleWalletPassesForDevice = async (
  req: Request,
  res: Response,
) => {
  const { deviceLibraryIdentifier, passTypeIdentifier } = req.params;

  if (!deviceLibraryIdentifier || !passTypeIdentifier) {
    return res.status(400).json({ message: "missing request fields" });
  }

  if (!isSupportedAppleWalletPassType(passTypeIdentifier)) {
    return res.status(404).json({ message: "pass type not found" });
  }

  const payload = await listAppleWalletSerialNumbers({
    deviceLibraryIdentifier,
    passTypeIdentifier,
    passesUpdatedSince:
      typeof req.query.passesUpdatedSince === "string"
        ? req.query.passesUpdatedSince
        : null,
  });

  return res.status(200).json(payload);
};

export const getAppleWalletPassBySerial = async (
  req: Request,
  res: Response,
) => {
  const { passTypeIdentifier, serialNumber } = req.params;

  if (!passTypeIdentifier || !serialNumber) {
    return res.status(400).json({ message: "missing request fields" });
  }

  if (!isSupportedAppleWalletPassType(passTypeIdentifier)) {
    return res.status(404).json({ message: "pass type not found" });
  }

  if (!isAuthorizedAppleWalletRequest(req.headers.authorization)) {
    return res.status(401).json({ message: "unauthorized" });
  }

  try {
    const pass = await buildAppleWalletPassBundle(serialNumber, req);
    if (!pass) {
      return res.status(404).json({ message: "card not found" });
    }

    const ifModifiedSince = req.headers["if-modified-since"];
    const serialUpdatedAt = await getAppleWalletSerialLastUpdated({
      passTypeIdentifier,
      serialNumber,
    });
    if (
      typeof ifModifiedSince === "string" &&
      serialUpdatedAt &&
      !Number.isNaN(Date.parse(ifModifiedSince))
    ) {
      const sinceDate = new Date(ifModifiedSince);
      if (serialUpdatedAt.getTime() <= sinceDate.getTime()) {
        return res.status(304).end();
      }
    }

    if (serialUpdatedAt) {
      res.setHeader("Last-Modified", serialUpdatedAt.toUTCString());
    }
    res.setHeader("Content-Type", pass.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${pass.fileName}"`,
    );
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(pass.buffer);
  } catch (error) {
    console.error("[apple-wallet] pass generation failed", error);
    return res
      .status(500)
      .json({ message: "unable to generate Apple Wallet pass" });
  }
};

export const appleWalletLog = async (req: Request, res: Response) => {
  const { logs } = req.body as { logs?: unknown };
  console.log("[apple-wallet][device-log]", logs);
  return res.status(200).json({});
};

export const stampCard = async (req: Request, res: Response) => {
  const session = await getSession(req, authConfig);
  if (!session?.user) {
    return res.status(401).json({ message: "unauthorized" });
  }

  const userId = (session.user as { id?: string }).id;
  const businessId = (session.user as { businessId?: string }).businessId;

  if (!userId || !businessId) {
    return res.status(403).json({ message: "invalid session" });
  }


  const { id: cardId } = req.params;
  const rawAddedStamps = (req.body as { addedStamps?: number | string })
    ?.addedStamps;
  if (!cardId) {
    return res.status(400).json({ message: "card id is required" });
  }

  const parsedAddedStamps =
    typeof rawAddedStamps === "string"
      ? Number.parseInt(rawAddedStamps, 10)
      : typeof rawAddedStamps === "number"
      ? Math.trunc(rawAddedStamps)
      : 1;

  if (Number.isNaN(parsedAddedStamps) || parsedAddedStamps <= 0) {
    return res.status(400).json({ message: "addedStamps must be a number >= 1" });
  }

  if (parsedAddedStamps > 50) {
    return res.status(400).json({ message: "addedStamps is too large" });
  }

  const card = await prisma.customerLoyaltyCard.findUnique({
    where: { id: cardId },
    include: {
      template: {
        select: {
          id: true,
          businessId: true,
          maxPoints: true,
          template: true,
        },
      },
      customer: {
        select: { name: true, email: true },
      },
      customerLoyaltyCardCycles: {
        orderBy: { cycleNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!card) {
    return res.status(404).json({ message: "card not found" });
  }

  if (card.template.businessId !== businessId) {
    return res.status(403).json({ message: "card not in your business" });
  }

  const latestCycle = card.customerLoyaltyCardCycles[0];
  if (!latestCycle) {
    return res.status(400).json({ message: "no active card cycle" });
  }

  const cycleIsComplete =
    latestCycle.completedAt !== null ||
    latestCycle.stampCount >= card.template.maxPoints;

  let cycleId = latestCycle.id;
  let cycleNumber = latestCycle.cycleNumber;
  let currentStampCount = latestCycle.stampCount;

  const maxPoints = card.template.maxPoints;
  let remainingStamps = parsedAddedStamps;
  let finalStampCount = currentStampCount;
  let finalCompleted = false;
  let rewardsEarned = 0;

  await prisma.$transaction(async (tx) => {
    if (cycleIsComplete) {
      const newCycle = await tx.customerLoyaltyCardCycle.create({
        data: {
          customerLoyaltyCardId: card.id,
          cycleNumber: latestCycle.cycleNumber + 1,
          stampCount: 0,
        },
      });
      cycleId = newCycle.id;
      cycleNumber = newCycle.cycleNumber;
      currentStampCount = 0;
    }

    while (remainingStamps > 0) {
      const available = maxPoints - currentStampCount;
      const addNow = Math.min(available, remainingStamps);
      const updatedCount = currentStampCount + addNow;
      const updatedCompletedAt =
        updatedCount >= maxPoints ? new Date() : undefined;

      await tx.customerLoyaltyCardCycle.update({
        where: { id: cycleId },
        data: {
          stampCount: updatedCount,
          ...(updatedCompletedAt ? { completedAt: updatedCompletedAt } : {}),
        },
      });

      remainingStamps -= addNow;
      finalStampCount = updatedCount;
      finalCompleted = updatedCount >= maxPoints;
      if (updatedCount >= maxPoints) {
        rewardsEarned += 1;
      }

      if (remainingStamps > 0 && updatedCount >= maxPoints) {
        const newCycle = await tx.customerLoyaltyCardCycle.create({
          data: {
            customerLoyaltyCardId: card.id,
            cycleNumber: cycleNumber + 1,
            stampCount: 0,
          },
        });
        cycleId = newCycle.id;
        cycleNumber = newCycle.cycleNumber;
        currentStampCount = 0;
      } else {
        currentStampCount = updatedCount;
      }
    }

    await tx.stampingLog.create({
      data: {
        customerLoyaltyCardCycleId: cycleId,
        stampedById: userId,
        addedStamps: parsedAddedStamps,
        stampCountAfter: finalStampCount,
        cardCompleted: finalCompleted,
      },
    });
  });

  const objectId =
    card.googleWalletObjectId ?? `${issuerId}.${card.id}`;
  let walletUpdated = false;
  let walletUpdateError: unknown = null;

  try {
    const heroImageUrl = getStampHeroImageUrl(card.template.id, finalStampCount);
    const updateRes = await walletRequest(
      `/loyaltyObject/${encodeURIComponent(
        objectId
      )}?updateMask=loyaltyPoints,imageModulesData,textModulesData`,
      {
        method: "PATCH",
        body: {
          loyaltyPoints: {
            label: "Stamps",
            balance: {
              string: `${finalStampCount}/${maxPoints}`,
            },
          },
          imageModulesData: [buildStampImageModule(heroImageUrl)],
          textModulesData: buildStampTextModules({
            stampCount: finalStampCount,
            maxPoints,
            rewards: rewardsEarned,
          }),
        },
      }
    );

    if (updateRes.ok) {
      walletUpdated = true;
    } else {
      const errorText = await updateRes.text();
      try {
        walletUpdateError = JSON.parse(errorText);
      } catch {
        walletUpdateError = errorText;
      }
    }
  } catch (error) {
    walletUpdateError = (error as Error).message ?? "wallet update failed";
  }

  const applePassTypeIdentifier = resolvePassTypeIdentifier();
  if (applePassTypeIdentifier) {
    void notifyAppleWalletPassUpdated({
      passTypeIdentifier: applePassTypeIdentifier,
      serialNumber: card.id,
      cardId: card.id,
    });
  }

  return res.json({
    cardId: card.id,
    customerName: card.customer.name,
    customerEmail: card.customer.email,
    cardTitle: card.template.template,
    stampCount: finalStampCount,
    maxPoints,
    completed: finalCompleted,
    addedStamps: parsedAddedStamps,
    rewardsEarned,
    walletUpdated,
    walletUpdateError,
  });
};

export const userCardControllers = {
  getCardById,
  getCardsByCustomerId,
  createCustomerCard,
  getGoogleWalletSaveLink,
  getAppleWalletPass,
  registerAppleWalletPass,
  unregisterAppleWalletPass,
  listAppleWalletPassesForDevice,
  getAppleWalletPassBySerial,
  appleWalletLog,
  stampCard,
};
