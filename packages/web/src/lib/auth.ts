import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { reactStartCookies } from "better-auth/react-start";
import { env } from "cloudflare:workers";
import { createDrizzle } from "../db";
import { logger } from "./logger";

/**
 * Creates a BetterAuth instance using Cloudflare bindings
 */
export function createAuth() {
  try {
    // Log environment variable availability (not values for security)
    logger.debug("Creating auth instance", {
      hasDB: !!env.DB,
      hasGithubClientId: !!env.GITHUB_CLIENT_ID,
      hasGithubClientSecret: !!env.GITHUB_CLIENT_SECRET,
      hasBetterAuthSecret: !!env.BETTER_AUTH_SECRET,
      hasWebUrl: !!env.WEB_URL,
      webUrl: env.WEB_URL, // Safe to log
    });

    const db = createDrizzle(env.DB);

    return betterAuth({
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
      plugins: [bearer(), deviceAuthorization(), reactStartCookies()],
    });
  } catch (error) {
    logger.error("Failed to create auth instance", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

export type Auth = ReturnType<typeof createAuth>;
