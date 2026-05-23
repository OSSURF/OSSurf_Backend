import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client';
import dotenv from 'dotenv';

dotenv.config({ quiet: true } as any);

const frontendURL = (
  process.env.FRONTEND_URL ?? 'https://ossurf.vercel.app'
).replace(/\/$/, '');
const authURL =
  process.env.BETTER_AUTH_URL ?? 'https://sourcesuf-backend.onrender.com';

export const auth = betterAuth({
  baseURL: authURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg' }),

  emailAndPassword: { enabled: false },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },

  trustedOrigins: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    frontendURL,
  ].filter((url): url is string => Boolean(url)),

  account: {
    skipStateCookieCheck: true,
    storeStateStrategy: 'database',
    accountLinking: {
      enabled: true,
      trustedProviders: ['github'],
    },
  },

  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  },
});
