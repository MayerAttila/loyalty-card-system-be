import http2 from "node:http2";
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

type Registration = {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
  pushToken: string;
  updatedAt: number;
};

const registrations = new Map<string, Registration>();
const serialUpdatedAt = new Map<string, number>();

const APPLE_AUTH_PREFIX = "ApplePass ";

function registrationKey(registration: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
}) {
  return `${registration.deviceLibraryIdentifier}:${registration.passTypeIdentifier}:${registration.serialNumber}`;
}

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
  if (!headerValue || Array.isArray(headerValue)) return null;
  if (!headerValue.startsWith(APPLE_AUTH_PREFIX)) return null;
  const token = headerValue.slice(APPLE_AUTH_PREFIX.length).trim();
  return token || null;
}

function getConfiguredApplePassTypeIdentifier() {
  return process.env.APPLE_WALLET_PASS_TYPE_ID?.trim() ?? "";
}

function getConfiguredAppleAuthToken() {
  return (
    process.env.APPLE_WALLET_AUTH_TOKEN?.trim() ??
    process.env.AUTH_SECRET?.trim() ??
    ""
  );
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

export function registerAppleWalletDevice(params: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
  pushToken: string;
}) {
  const key = registrationKey(params);
  const now = Date.now();
  const exists = registrations.has(key);
  registrations.set(key, {
    ...params,
    updatedAt: now,
  });
  if (!serialUpdatedAt.has(params.serialNumber)) {
    serialUpdatedAt.set(params.serialNumber, now);
  }
  return { created: !exists };
}

export function unregisterAppleWalletDevice(params: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
}) {
  const key = registrationKey(params);
  return registrations.delete(key);
}

export function listAppleWalletSerialNumbers(params: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  passesUpdatedSince?: string | null;
}) {
  const since = parseUpdatedSince(params.passesUpdatedSince ?? null);
  const serialNumbers: string[] = [];
  let lastUpdated = 0;

  for (const registration of registrations.values()) {
    if (
      registration.deviceLibraryIdentifier !== params.deviceLibraryIdentifier ||
      registration.passTypeIdentifier !== params.passTypeIdentifier
    ) {
      continue;
    }

    const serialUpdateTime =
      serialUpdatedAt.get(registration.serialNumber) ?? registration.updatedAt;
    if (since !== null && serialUpdateTime <= since) {
      continue;
    }

    serialNumbers.push(registration.serialNumber);
    if (serialUpdateTime > lastUpdated) {
      lastUpdated = serialUpdateTime;
    }
  }

  const uniqueSerials = Array.from(new Set(serialNumbers));
  return {
    serialNumbers: uniqueSerials,
    lastUpdated:
      lastUpdated > 0
        ? new Date(lastUpdated).toISOString()
        : new Date().toISOString(),
  };
}

export function getAppleWalletSerialLastUpdated(serialNumber: string) {
  const updated = serialUpdatedAt.get(serialNumber);
  return updated ? new Date(updated) : null;
}

export async function notifyAppleWalletPassUpdated(params: {
  passTypeIdentifier: string;
  serialNumber: string;
}) {
  const now = Date.now();
  serialUpdatedAt.set(params.serialNumber, now);

  const pushTokens = new Set<string>();
  for (const registration of registrations.values()) {
    if (
      registration.passTypeIdentifier === params.passTypeIdentifier &&
      registration.serialNumber === params.serialNumber
    ) {
      pushTokens.add(registration.pushToken);
      registration.updatedAt = now;
    }
  }

  if (!pushTokens.size) return;

  const apnsConfig = getApnsConfig();
  if (!apnsConfig) {
    console.warn(
      "[apple-wallet] update registered but APNs is not configured; skipping push notification."
    );
    return;
  }

  const bearerToken = getApnsJwt(apnsConfig);
  const pushResults = await Promise.allSettled(
    Array.from(pushTokens).map((pushToken) =>
      sendApnsPush({
        host: apnsConfig.host,
        topic: apnsConfig.topic,
        bearerToken,
        pushToken,
      })
    )
  );

  for (const result of pushResults) {
    if (result.status === "rejected") {
      console.warn("[apple-wallet] APNs push failed", result.reason);
    }
  }
}
