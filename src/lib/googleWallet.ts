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
