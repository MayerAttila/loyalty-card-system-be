import type { ExpressAuthConfig } from "@auth/express";
import Credentials from "@auth/core/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma/client.js";

const authUrl = process.env.AUTH_URL;
const parsedAuthUrl = authUrl ? new URL(authUrl) : null;
const configuredCookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();
const cookieDomain =
  configuredCookieDomain && configuredCookieDomain.length > 0
    ? configuredCookieDomain
    : parsedAuthUrl?.hostname;
const isSecureCookie = parsedAuthUrl?.protocol === "https:";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const authConfig: ExpressAuthConfig = {
  secret: process.env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  ...(cookieDomain && isSecureCookie
    ? {
        cookies: {
          sessionToken: {
            name: "__Secure-authjs.session-token",
            options: {
              httpOnly: true,
              sameSite: "lax",
              path: "/",
              secure: isSecureCookie,
              domain: cookieDomain,
            },
          },
          csrfToken: {
            name: "__Host-authjs.csrf-token",
            options: {
              httpOnly: true,
              sameSite: "lax",
              path: "/",
              secure: isSecureCookie,
            },
          },
          callbackUrl: {
            name: "__Secure-authjs.callback-url",
            options: {
              sameSite: "lax",
              path: "/",
              secure: isSecureCookie,
              domain: cookieDomain,
            },
          },
        },
      }
    : {}),
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        console.log("Auth credentials received:", credentials);
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          console.log("Auth credentials invalid:", parsed.error.flatten());
        }
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        let user = null;
        try {
          user = await prisma.user.findUnique({
            where: { email },
            include: {
              business: {
                select: { name: true },
              },
            },
          });
        } catch (error) {
          console.error("Auth user lookup failed:", error);
          throw error;
        }
        console.log("Auth user lookup:", user ? user.id : "not found");

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(password, user.password);
        console.log("Auth password match:", isValid);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          businessId: user.businessId,
          businessName: user.business.name,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.businessId = (user as any).businessId;
        token.businessName = (user as any).businessName;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user && token.id) {
        const user = await prisma.user.findUnique({
          where: { id: String(token.id) },
          include: {
            business: {
              select: {
                name: true,
                images: {
                  where: { kind: "BUSINESS_LOGO" },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        });

        if (user) {
          const businessImages =
            (user.business as { images?: Array<{ id: string }> } | null)?.images ??
            [];
          const hasLogo = businessImages.length > 0;
          (session.user as any).id = user.id;
          (session.user as any).email = user.email;
          (session.user as any).name = user.name;
          (session.user as any).role = user.role;
          (session.user as any).businessId = user.businessId;
          (session.user as any).businessName = user.business.name;
          (session.user as any).businessHasLogo = hasLogo;
          return session;
        }

        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).businessId = token.businessId;
        (session.user as any).businessName = token.businessName;
      }

      return session;
    },
  },
};
