import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { env } from "cloudflare:workers";
import { createDrizzle } from "../db";
import { logger } from "./logger";

/**
 * Per-request auth instance cache
 * In Cloudflare Workers, env bindings are per-request, so we can't use a global singleton
 * Instead, we cache the instance per request using AsyncLocalStorage pattern
 */
let authInstanceCache: ReturnType<typeof betterAuth> | null = null;
let lastEnvHash: string | null = null;

/**
 * Creates a hash of the environment bindings to detect changes
 * In development, Cloudflare Workers may recreate env bindings
 */
function getEnvHash(): string {
  return `${env.DB?.toString()}-${env.BETTER_AUTH_SECRET}`;
}

/**
 * Creates or returns cached BetterAuth instance for current request
 * Uses request-scoped singleton pattern recommended for Cloudflare Workers
 */
export function createAuth() {
  try {
    const currentEnvHash = getEnvHash();

    // Return cached instance if env hasn't changed
    if (authInstanceCache && lastEnvHash === currentEnvHash) {
      return authInstanceCache;
    }

    // Log only when actually creating a new instance
    logger.debug("Creating auth instance", {
      hasDB: !!env.DB,
      hasGithubClientId: !!env.GITHUB_CLIENT_ID,
      hasGithubClientSecret: !!env.GITHUB_CLIENT_SECRET,
      hasBetterAuthSecret: !!env.BETTER_AUTH_SECRET,
      hasWebUrl: !!env.WEB_URL,
      webUrl: env.WEB_URL, // Safe to log
      cached: !!authInstanceCache,
    });

    const db = createDrizzle(env.DB);

    authInstanceCache = betterAuth({
      database: drizzleAdapter(db, {
        provider: "sqlite",
      }),
      socialProviders: {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        },
      },
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.WEB_URL,
      trustedOrigins: [env.WEB_URL],
      plugins: [
        bearer(),
        deviceAuthorization({
          verificationUri: "/app/device",
        }),
        tanstackStartCookies(),
      ],
    });

    lastEnvHash = currentEnvHash;
    return authInstanceCache;
  } catch (error) {
    logger.error("Failed to create auth instance", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

export type Auth = ReturnType<typeof createAuth>;
