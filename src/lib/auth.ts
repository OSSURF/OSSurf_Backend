import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client";
import dotenv from "dotenv";

dotenv.config({ quiet: true } as any);



export const auth = betterAuth({
  baseURL: process.env.NODE_ENV === "production"
    ? "https://ossurf.vercel.app"
    : (process.env.BETTER_AUTH_URL || "http://localhost:3000"),

  database: drizzleAdapter(db, { provider: "pg" }),

  emailAndPassword: { enabled: true },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      redirectURI: process.env.NODE_ENV === "production"
        ? "https://ossurf.vercel.app/api/auth/callback/github"
        : (process.env.FRONTEND_URL 
            ? `${process.env.FRONTEND_URL.replace(/\/$/, "")}/api/auth/callback/github`
            : "http://localhost:5173/api/auth/callback/github"),
    },
  },

  trustedOrigins: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    process.env.FRONTEND_URL?.replace(/\/$/, ""),
    "https://ossurf.vercel.app",
    "https://*.vercel.app",
  ].filter(Boolean),

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    trustedProxyHeaders: true,
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google"],
    },
  },
});
