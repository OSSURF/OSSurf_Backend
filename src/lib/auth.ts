import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client";
import dotenv from "dotenv";

dotenv.config({ quiet: true } as any);



const frontendURL = (process.env.FRONTEND_URL ?? "https://ossurf.vercel.app").replace(/\/$/, "");
const isProd = process.env.NODE_ENV === "production" || frontendURL.startsWith("https://");
const authURL = isProd ? frontendURL : "http://localhost:5173";

// Programmatically override BETTER_AUTH_URL env var to ensure Better Auth is forced to use the
// frontend URL (via proxy) as the baseURL, even if it is incorrectly set in the Render dashboard or .env file.
process.env.BETTER_AUTH_URL = authURL;

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
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    frontendURL,
  ].filter(Boolean),

  advanced: {
    useSecureCookies: isProd,
    trustedProxyHeaders: true,
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: isProd,
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google"],
    },
  },
});
