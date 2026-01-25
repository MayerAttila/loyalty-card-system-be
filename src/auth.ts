import type { ExpressAuthConfig } from "@auth/express";
import Credentials from "@auth/core/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma/client.js";

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
          approved: user.approved,
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
        token.approved = (user as any).approved;
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
          (session.user as any).approved = user.approved;
          (session.user as any).businessHasLogo = hasLogo;
          return session;
        }

        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).businessId = token.businessId;
        (session.user as any).businessName = token.businessName;
        (session.user as any).approved = token.approved;
      }

      return session;
    },
  },
};
