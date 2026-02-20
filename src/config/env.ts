function normalizeCookieDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes("://") || trimmed.includes("/") || /\s/.test(trimmed)) {
    return null;
  }

  const normalized = trimmed.replace(/^\.+/, "");
  if (!normalized) return null;
  if (!/^[a-z0-9.-]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function hostMatchesCookieDomain(host: string, cookieDomain: string) {
  const normalizedHost = host.trim().toLowerCase();
  const normalizedDomain = cookieDomain.trim().toLowerCase();
  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith(`.${normalizedDomain}`)
  );
}

function validateUrl(value: string, envName: string, errors: string[]) {
  try {
    return new URL(value);
  } catch {
    errors.push(`${envName} must be a valid URL`);
    return null;
  }
}

function validateRuntimeEnv() {
  const errors: string[] = [];
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const portRaw = process.env.PORT ?? "3000";
  const port = Number(portRaw);
  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("PORT must be an integer between 1 and 65535");
  }

  const authUrlRaw = process.env.AUTH_URL?.trim() ?? "";
  const parsedAuthUrl = authUrlRaw
    ? validateUrl(authUrlRaw, "AUTH_URL", errors)
    : null;

  if (nodeEnv === "production") {
    if (!authUrlRaw) {
      errors.push("AUTH_URL is required in production");
    } else if (parsedAuthUrl?.protocol !== "https:") {
      errors.push("AUTH_URL must use https in production");
    }
  }

  const cookieDomainRaw = process.env.AUTH_COOKIE_DOMAIN?.trim() ?? "";
  if (cookieDomainRaw) {
    const normalizedCookieDomain = normalizeCookieDomain(cookieDomainRaw);
    if (!normalizedCookieDomain) {
      errors.push(
        "AUTH_COOKIE_DOMAIN must be a hostname-style domain (for example: .loyale.online)"
      );
    } else if (
      parsedAuthUrl &&
      !hostMatchesCookieDomain(parsedAuthUrl.hostname, normalizedCookieDomain)
    ) {
      errors.push(
        "AUTH_COOKIE_DOMAIN must match AUTH_URL hostname or its parent domain"
      );
    }
  }

  const authSecret = process.env.AUTH_SECRET?.trim() ?? "";
  const applePassTypeId = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim() ?? "";
  const appleWalletAuthToken = process.env.APPLE_WALLET_AUTH_TOKEN?.trim() ?? "";

  if (applePassTypeId && !appleWalletAuthToken) {
    errors.push(
      "APPLE_WALLET_AUTH_TOKEN is required when APPLE_WALLET_PASS_TYPE_ID is set"
    );
  }

  if (appleWalletAuthToken && authSecret && appleWalletAuthToken === authSecret) {
    errors.push("APPLE_WALLET_AUTH_TOKEN must be different from AUTH_SECRET");
  }

  const webServiceUrlRaw = process.env.APPLE_WALLET_WEB_SERVICE_URL?.trim() ?? "";
  if (webServiceUrlRaw) {
    const parsedWebServiceUrl = validateUrl(
      webServiceUrlRaw,
      "APPLE_WALLET_WEB_SERVICE_URL",
      errors
    );
    if (parsedWebServiceUrl && parsedWebServiceUrl.protocol !== "https:") {
      errors.push("APPLE_WALLET_WEB_SERVICE_URL must use https");
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `[env] Invalid configuration:\n${errors.map((error) => `- ${error}`).join("\n")}`
    );
  }

  return {
    port,
    nodeEnv,
    corsOrigin,
  };
}

const validated = validateRuntimeEnv();

export const env = {
  PORT: validated.port,
  NODE_ENV: validated.nodeEnv,
  CORS_ORIGIN: validated.corsOrigin,
};
