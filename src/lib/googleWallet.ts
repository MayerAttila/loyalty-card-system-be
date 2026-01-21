import fs from "fs";
import jwt from "jsonwebtoken";
import { GoogleAuth } from "google-auth-library";

const key = JSON.parse(
  fs.readFileSync(process.env.GOOGLE_WALLET_KEY_PATH!, "utf8"),
);

export const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!;

export const googleAuth = new GoogleAuth({
  credentials: key,
  scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
});

const walletBaseUrl = "https://walletobjects.googleapis.com/walletobjects/v1";

async function getAccessToken() {
  const client = await googleAuth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token =
    typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error("Unable to acquire Google Wallet access token");
  }
  return token;
}

export async function walletRequest(
  path: string,
  options: { method: string; body?: unknown } = { method: "GET" }
) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  return fetch(`${walletBaseUrl}${path}`, {
    method: options.method,
    headers,
    body,
  });
}

export function createSaveJwt(objectId: string, classId: string) {
  const claims = {
    iss: key.client_email,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    payload: {
      loyaltyObjects: [
        {
          id: objectId,
          classId: classId,
        },
      ],
    },
  };

  return jwt.sign(claims, key.private_key, {
    algorithm: "RS256",
  });
}
