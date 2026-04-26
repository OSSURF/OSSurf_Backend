import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client";
import dotenv from "dotenv";

dotenv.config();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    // google:{
    //   clientId:process.env.GOOGLE_CLIENT_ID!,
    //   clientSecret:process.env.GITHUB_CLIENT_SECRET!,
    // }
  },
  trustedOrigins: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    process.env.FRONTEND_URL as string,
  ].filter(Boolean),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google"],
    },
  },
});
