import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { Resend } from "resend";
import { magicLink, username, admin, anonymous } from "better-auth/plugins";
import generateUniqueName from "../utils/unique";
import { Email } from "./email";

const resend = new Resend(process.env.RESEND_API_KEY);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export const auth = betterAuth({
  trustedOrigins: [FRONTEND_URL],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    twitter: {
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      walletAddress: { type: "string", required: false, defaultValue: "" },
      isPro: { type: "boolean", defaultValue: false },
      gender: { type: "string", required: false, defaultValue: "" },
    },
  },
  onAPIError: {
    onError: (error) => {
      console.error(error);
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({
        email,
        url,
        token,
      }: {
        email: string;
        url: string;
        token: string;
      }) => {
        await resend.emails.send({
          from: "Acme <onboarding@resend.dev>",
          to: email,
          subject: "Continue with Cashual Call",
          react: Email({ url }),
        });
      },
    }),
    username(),
    admin(),
    anonymous({
      generateName: generateUniqueName,
      emailDomainName: "cashualcall.com",
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        if (!newUser?.user?.email) return;

        // Check if the email is already taken by another user
        const taken = await prisma.user.findUnique({
          where: { email: newUser.user.email },
        });
        if (taken && taken.id !== newUser.user.id) {
          throw new Error(
            "That email is already registered. Sign in and link accounts from settings."
          );
        }

        // Update the newUser with the username (assuming newUser.user.id is the correct user to update)
        await prisma.user.update({
          where: { id: newUser.user.id },
          data: {
            email: newUser.user.email,
            emailVerified: newUser.user.emailVerified ?? null,
            username: anonymousUser.user.name,
          },
        });
      },
    }),
  ],
});
