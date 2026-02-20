import http2 from "node:http2";
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";

const APPLE_AUTH_PREFIX = "ApplePass ";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeHttpsUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return null;
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
    parsed.pathname = cleanPath || "/";
    return trimTrailingSlash(parsed.toString());
  } catch {
    return null;
  }
}

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseAppleAuthHeader(headerValue?: string | string[] | null) {
  if (!headerValue) return null;

  const rawHeader = Array.isArray(headerValue)
    ? headerValue.find((value) => typeof value === "string" && value.trim())
    : headerValue;
  if (!rawHeader) return null;

  if (!rawHeader.toLowerCase().startsWith(APPLE_AUTH_PREFIX.toLowerCase())) {
    return null;
  }
  let token = rawHeader.slice(APPLE_AUTH_PREFIX.length).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }

  return token || null;
}

function getConfiguredApplePassTypeIdentifier() {
  return process.env.APPLE_WALLET_PASS_TYPE_ID?.trim() ?? "";
}

function getConfiguredAppleAuthToken() {
  return process.env.APPLE_WALLET_AUTH_TOKEN?.trim() ?? "";
}

function getConfiguredWebServiceBaseUrl() {
  const explicitWebServiceUrl =
    process.env.APPLE_WALLET_WEB_SERVICE_URL?.trim() ?? "";
  if (explicitWebServiceUrl) {
    return normalizeHttpsUrl(explicitWebServiceUrl);
  }

  const appBaseUrl = process.env.APP_BASE_URL?.trim() ?? "";
  const normalizedAppBaseUrl = normalizeHttpsUrl(appBaseUrl);
  if (!normalizedAppBaseUrl) {
    return null;
  }

  return `${normalizedAppBaseUrl}/user-loyalty-card/apple-wallet`;
}

function parseUpdatedSince(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function getApnsConfig() {
  const keyPath = process.env.APPLE_WALLET_APNS_KEY_PATH?.trim();
  const keyId = process.env.APPLE_WALLET_APNS_KEY_ID?.trim();
  const teamId = process.env.APPLE_WALLET_TEAM_ID?.trim();
  const topic = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim();
  const useSandbox = process.env.APPLE_WALLET_APNS_USE_SANDBOX === "true";

  if (!keyPath || !keyId || !teamId || !topic) {
    return null;
  }
  if (!existsSync(keyPath)) {
    return null;
  }

  return {
    keyPath,
    keyId,
    teamId,
    topic,
    host: useSandbox
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com",
  };
}

let cachedApnsJwt: { token: string; issuedAt: number } | null = null;

function getApnsJwt(config: {
  keyPath: string;
  keyId: string;
  teamId: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedApnsJwt && now - cachedApnsJwt.issuedAt < 50 * 60) {
    return cachedApnsJwt.token;
  }

  const privateKey = readFileSync(config.keyPath, "utf8");
  const header = toBase64Url(
    JSON.stringify({ alg: "ES256", kid: config.keyId })
  );
  const payload = toBase64Url(
    JSON.stringify({ iss: config.teamId, iat: now })
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("sha256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  const token = `${unsigned}.${toBase64Url(signature)}`;
  cachedApnsJwt = { token, issuedAt: now };
  return token;
}

async function sendApnsPush(params: {
  host: string;
  topic: string;
  bearerToken: string;
  pushToken: string;
}) {
  await new Promise<void>((resolve, reject) => {
    const client = http2.connect(params.host);
    let statusCode = 0;
    let responseBody = "";

    client.on("error", (error) => {
      client.close();
      reject(error);
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${params.pushToken}`,
      authorization: `bearer ${params.bearerToken}`,
      "apns-topic": params.topic,
      "apns-priority": "5",
      "apns-push-type": "background",
    });

    req.on("response", (headers) => {
      statusCode = Number(headers[":status"] ?? 0);
    });
    req.on("data", (chunk) => {
      responseBody += Buffer.from(chunk).toString("utf8");
    });
    req.on("error", (error) => {
      client.close();
      reject(error);
    });
    req.on("end", () => {
      client.close();
      if (statusCode >= 200 && statusCode < 300) {
        resolve();
        return;
      }
      reject(
        new Error(
          `APNs push failed (${statusCode}): ${responseBody || "no body"}`
        )
      );
    });

    req.end("{}");
  });
}

export function getAppleWalletAuthToken() {
  return getConfiguredAppleAuthToken() || null;
}

export function getAppleWalletWebServiceUrl() {
  return getConfiguredWebServiceBaseUrl();
}

export function isSupportedAppleWalletPassType(passTypeIdentifier: string) {
  const configured = getConfiguredApplePassTypeIdentifier();
  return !!configured && configured === passTypeIdentifier;
}

export function isAuthorizedAppleWalletRequest(
  authorizationHeader?: string | string[] | null
) {
  const expectedToken = getConfiguredAppleAuthToken();
  if (!expectedToken) return false;
  const receivedToken = parseAppleAuthHeader(authorizationHeader);
  return !!receivedToken && receivedToken === expectedToken;
}

type TimestampValue = Date | string;
type ExistsRow = { exists: number };
type RegistrationRow = { serialNumber: string; updatedAt: TimestampValue };
type SerialUpdateRow = { serialNumber: string; updatedAt: TimestampValue };
type UpdatedAtRow = { updatedAt: TimestampValue };
type PushTokenRow = { pushToken: string };
type ParsedApnsError = { statusCode: number; reason: string | null };

function toDate(value: TimestampValue) {
  return value instanceof Date ? value : new Date(value);
}

function parseApnsError(value: unknown): ParsedApnsError {
  const message = value instanceof Error ? value.message : String(value);
  const match = message.match(/APNs push failed \((\d+)\):\s*(.*)$/s);
  if (!match) {
    return { statusCode: 0, reason: null };
  }

  const statusCode = Number(match[1] ?? 0);
  const rawBody = (match[2] ?? "").trim();
  if (!rawBody) {
    return { statusCode, reason: null };
  }

  try {
    const parsed = JSON.parse(rawBody) as { reason?: unknown };
    return {
      statusCode,
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
    };
  } catch {
    return { statusCode, reason: null };
  }
}

export async function registerAppleWalletDevice(params: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
  cardId: string;
  pushToken: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<ExistsRow[]>`
      SELECT 1 AS "exists"
      FROM "AppleWalletRegistration"
      WHERE "deviceLibraryIdentifier" = ${params.deviceLibraryIdentifier}
        AND "passTypeIdentifier" = ${params.passTypeIdentifier}
        AND "serialNumber" = ${params.serialNumber}
      LIMIT 1
    `;
    const now = new Date();

    if (existing.length > 0) {
      await tx.$executeRaw`
        UPDATE "AppleWalletRegistration"
        SET "pushToken" = ${params.pushToken},
            "cardId" = ${params.cardId},
            "updatedAt" = ${now}
        WHERE "deviceLibraryIdentifier" = ${params.deviceLibraryIdentifier}
          AND "passTypeIdentifier" = ${params.passTypeIdentifier}
          AND "serialNumber" = ${params.serialNumber}
      `;
      return { created: false };
    }

    await tx.$executeRaw`
      INSERT INTO "AppleWalletRegistration" (
        "deviceLibraryIdentifier",
        "passTypeIdentifier",
        "serialNumber",
        "cardId",
        "pushToken",
        "updatedAt"
      )
      VALUES (
        ${params.deviceLibraryIdentifier},
        ${params.passTypeIdentifier},
        ${params.serialNumber},
        ${params.cardId},
        ${params.pushToken},
        ${now}
      )
    `;

    const serialUpdate = await tx.$queryRaw<ExistsRow[]>`
      SELECT 1 AS "exists"
      FROM "AppleWalletSerialUpdate"
      WHERE "passTypeIdentifier" = ${params.passTypeIdentifier}
        AND "serialNumber" = ${params.serialNumber}
      LIMIT 1
    `;
    if (serialUpdate.length === 0) {
      await tx.$executeRaw`
        INSERT INTO "AppleWalletSerialUpdate" (
          "passTypeIdentifier",
          "serialNumber",
          "cardId",
          "updatedAt"
        )
        VALUES (
          ${params.passTypeIdentifier},
          ${params.serialNumber},
          ${params.cardId},
          ${now}
        )
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "AppleWalletSerialUpdate"
        SET "cardId" = ${params.cardId}
        WHERE "passTypeIdentifier" = ${params.passTypeIdentifier}
          AND "serialNumber" = ${params.serialNumber}
          AND "cardId" <> ${params.cardId}
      `;
    }

    return { created: true };
  });
}

export async function unregisterAppleWalletDevice(params: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
}) {
  const deletedCount = await prisma.$executeRaw`
    DELETE FROM "AppleWalletRegistration"
    WHERE "deviceLibraryIdentifier" = ${params.deviceLibraryIdentifier}
      AND "passTypeIdentifier" = ${params.passTypeIdentifier}
      AND "serialNumber" = ${params.serialNumber}
  `;

  return deletedCount > 0;
}

export async function listAppleWalletSerialNumbers(params: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  passesUpdatedSince?: string | null;
}) {
  const since = parseUpdatedSince(params.passesUpdatedSince ?? null);
  const registrations = await prisma.$queryRaw<RegistrationRow[]>`
    SELECT "serialNumber", "updatedAt"
    FROM "AppleWalletRegistration"
    WHERE "deviceLibraryIdentifier" = ${params.deviceLibraryIdentifier}
      AND "passTypeIdentifier" = ${params.passTypeIdentifier}
  `;

  if (!registrations.length) {
    return {
      serialNumbers: [] as string[],
      lastUpdated: new Date().toISOString(),
    };
  }

  const serialFallbackUpdatedAt = new Map<string, number>();
  for (const registration of registrations) {
    const updatedAtMs = toDate(registration.updatedAt).getTime();
    const existing = serialFallbackUpdatedAt.get(registration.serialNumber);
    if (existing === undefined || updatedAtMs > existing) {
      serialFallbackUpdatedAt.set(registration.serialNumber, updatedAtMs);
    }
  }

  const serialNumbers = Array.from(serialFallbackUpdatedAt.keys());
  const serialUpdates =
    serialNumbers.length > 0
      ? await prisma.$queryRaw<SerialUpdateRow[]>(
          Prisma.sql`
            SELECT "serialNumber", "updatedAt"
            FROM "AppleWalletSerialUpdate"
            WHERE "passTypeIdentifier" = ${params.passTypeIdentifier}
              AND "serialNumber" IN (${Prisma.join(serialNumbers)})
          `,
        )
      : [];

  const serialUpdatedAt = new Map<string, number>(
    serialUpdates.map((serialUpdate) => [
      serialUpdate.serialNumber,
      toDate(serialUpdate.updatedAt).getTime(),
    ]),
  );

  const filteredSerialNumbers: string[] = [];
  let lastUpdated = 0;
  for (const serialNumber of serialNumbers) {
    const updatedAt =
      serialUpdatedAt.get(serialNumber) ??
      serialFallbackUpdatedAt.get(serialNumber) ??
      0;
    if (since !== null && updatedAt <= since) {
      continue;
    }
    filteredSerialNumbers.push(serialNumber);
    if (updatedAt > lastUpdated) {
      lastUpdated = updatedAt;
    }
  }

  return {
    serialNumbers: filteredSerialNumbers,
    lastUpdated:
      lastUpdated > 0
        ? new Date(lastUpdated).toISOString()
        : new Date().toISOString(),
  };
}

export async function getAppleWalletSerialLastUpdated(params: {
  passTypeIdentifier: string;
  serialNumber: string;
}) {
  const serialUpdate = await prisma.$queryRaw<UpdatedAtRow[]>`
    SELECT "updatedAt"
    FROM "AppleWalletSerialUpdate"
    WHERE "passTypeIdentifier" = ${params.passTypeIdentifier}
      AND "serialNumber" = ${params.serialNumber}
    LIMIT 1
  `;
  if (serialUpdate.length > 0) {
    return toDate(serialUpdate[0].updatedAt);
  }

  const latestRegistration = await prisma.$queryRaw<UpdatedAtRow[]>`
    SELECT "updatedAt"
    FROM "AppleWalletRegistration"
    WHERE "passTypeIdentifier" = ${params.passTypeIdentifier}
      AND "serialNumber" = ${params.serialNumber}
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;

  return latestRegistration.length > 0
    ? toDate(latestRegistration[0].updatedAt)
    : null;
}

export async function notifyAppleWalletPassUpdated(params: {
  passTypeIdentifier: string;
  serialNumber: string;
  cardId: string;
}) {
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "AppleWalletSerialUpdate" (
      "passTypeIdentifier",
      "serialNumber",
      "cardId",
      "updatedAt"
    )
    VALUES (
      ${params.passTypeIdentifier},
      ${params.serialNumber},
      ${params.cardId},
      ${now}
    )
    ON CONFLICT ("passTypeIdentifier", "serialNumber")
    DO UPDATE
    SET "updatedAt" = EXCLUDED."updatedAt",
        "cardId" = EXCLUDED."cardId"
  `;

  const registrations = await prisma.$queryRaw<PushTokenRow[]>`
    SELECT "pushToken"
    FROM "AppleWalletRegistration"
    WHERE "passTypeIdentifier" = ${params.passTypeIdentifier}
      AND "serialNumber" = ${params.serialNumber}
  `;
  const pushTokens = new Set<string>(
    registrations
      .map((registration) => registration.pushToken)
      .filter((token) => typeof token === "string" && token.length > 0),
  );

  if (!pushTokens.size) return;

  const apnsConfig = getApnsConfig();
  if (!apnsConfig) {
    console.warn(
      "[apple-wallet] update registered but APNs is not configured; skipping push notification."
    );
    return;
  }

  const bearerToken = getApnsJwt(apnsConfig);
  const pushTokenList = Array.from(pushTokens);
  const pushResults = await Promise.allSettled(
    pushTokenList.map((pushToken) =>
      sendApnsPush({
        host: apnsConfig.host,
        topic: apnsConfig.topic,
        bearerToken,
        pushToken,
      }),
    ),
  );

  const invalidPushTokens: string[] = [];
  for (const [index, result] of pushResults.entries()) {
    if (result.status === "rejected") {
      const parsedError = parseApnsError(result.reason);
      const shouldDeleteToken =
        parsedError.reason === "Unregistered" ||
        parsedError.reason === "BadDeviceToken" ||
        parsedError.reason === "DeviceTokenNotForTopic" ||
        parsedError.statusCode === 410;
      if (shouldDeleteToken) {
        invalidPushTokens.push(pushTokenList[index] ?? "");
      }
      console.warn("[apple-wallet] APNs push failed", result.reason);
    }
  }

  const cleanupTokens = invalidPushTokens.filter((token) => token.length > 0);
  if (cleanupTokens.length > 0) {
    await prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM "AppleWalletRegistration"
        WHERE "passTypeIdentifier" = ${params.passTypeIdentifier}
          AND "serialNumber" = ${params.serialNumber}
          AND "pushToken" IN (${Prisma.join(cleanupTokens)})
      `,
    );
  }
}
