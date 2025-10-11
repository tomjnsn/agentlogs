import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { DrizzleDB } from './drizzle';

/**
 * Environment variables required for BetterAuth
 */
export interface AuthEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  WEB_URL: string;
}

/**
 * Creates a BetterAuth instance for the given environment
 * This is a factory function called per-request in Cloudflare Workers
 *
 * @param db - Drizzle database instance
 * @param env - Environment variables with GitHub OAuth and auth config
 * @returns BetterAuth instance configured for GitHub OAuth
 */
export function createAuth(db: DrizzleDB, env: AuthEnv) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite', // D1 is SQLite-based
    }),
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_URL, env.BETTER_AUTH_URL], // Allow web app and API server
  });
}

export type Auth = ReturnType<typeof createAuth>;
