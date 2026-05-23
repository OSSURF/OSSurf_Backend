import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client";
import dotenv from "dotenv";

dotenv.config({ quiet: true } as any);



const frontendURL = (process.env.FRONTEND_URL ?? "https://ossurf.vercel.app").replace(/\/$/, "");
const authURL = process.env.NODE_ENV === "production"
  ? frontendURL
  : (process.env.BETTER_AUTH_URL ?? "http://localhost:3000");

export const auth = betterAuth({
  baseURL: authURL,
  secret: process.env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, { provider: "pg" }),

  emailAndPassword: { enabled: false },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },

  trustedOrigins: [
    "https://ossurf.vercel.app",
    "https://ossurf-git-*-vercel.app",
  ],

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production" || authURL.startsWith("https://"),
    trustedProxyHeaders: true,
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || authURL.startsWith("https://"),
    },
  },

  account: {
    skipStateCookieCheck: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google"],
    },
  },
});
