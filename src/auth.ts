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

        const user = await prisma.user.findUnique({
          where: { email },
        });
        console.log("Auth user lookup:", user ? user.id : "not found");

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(password, user.password);
        console.log("Auth password match:", isValid);
        if (!isValid) return null;

        console.log("Auth user approved:", user.approved);
        if (!user.approved) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
};
