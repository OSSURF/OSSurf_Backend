import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client";
import dotenv from "dotenv";

dotenv.config({ quiet: true } as any);



const backendURL = (process.env.BETTER_AUTH_URL ?? "https://sourcesuf-backend.onrender.com").replace(/\/$/, "");
const frontendURL = (process.env.FRONTEND_URL ?? "https://ossurf.vercel.app").replace(/\/$/, "");

export const auth = betterAuth({
  baseURL: backendURL,

  database: drizzleAdapter(db, { provider: "pg" }),

  emailAndPassword: { enabled: true },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },

  trustedOrigins: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    frontendURL,
  ].filter(Boolean),

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    trustedProxyHeaders: true,
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
