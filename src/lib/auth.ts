import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client';
import { bearer } from 'better-auth/plugins';
import dotenv from 'dotenv';

dotenv.config({ quiet: true } as any);

const frontendURL = (
  process.env.FRONTEND_URL ?? 'https://ossurf.vercel.app'
).replace(/\/$/, '');


const authURL = frontendURL;
const isProd = process.env.NODE_ENV === 'production';

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
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  plugins: [
    bearer(),
  ],

  trustedOrigins: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    frontendURL,
    'https://sourcesuf-backend.onrender.com',
  ].filter((url): url is string => Boolean(url)),

  account: {
    skipStateCookieCheck: true,
    storeStateStrategy: 'database',
    accountLinking: {
      enabled: true,
      trustedProviders: ['github', 'google'],
    },
  },

  advanced: {
    useSecureCookies: isProd,
    // Required: trust X-Forwarded-* headers from Vercel/Render proxy
    trustedProxyHeaders: true,
    // 'lax' works because Vercel proxies /api/* making auth same-origin.
    // 'none' would signal third-party cookies — exactly what Safari ITP blocks.
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: isProd,
    },
  },
});
