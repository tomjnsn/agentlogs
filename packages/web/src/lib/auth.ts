import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { createDrizzle } from "../db";
import * as queries from "../db/queries";
import { env } from "./env";
import { logger } from "./logger";

const ADMIN_EMAILS = ["tobias.hagemann@gmail.com", "hello@philippspiess.com", "skymk1@gmail.com"];

let authInstanceCache: ReturnType<typeof betterAuth> | null = null;

/**
 * Creates or returns cached BetterAuth instance.
 * Singleton pattern since env is stable in Node.js (unlike per-request in Workers).
 */
export function createAuth() {
  if (authInstanceCache) {
    return authInstanceCache;
  }

  logger.debug("Creating auth instance", {
    hasGithubClientId: !!env.GITHUB_CLIENT_ID,
    hasGithubClientSecret: !!env.GITHUB_CLIENT_SECRET,
    hasBetterAuthSecret: !!env.BETTER_AUTH_SECRET,
    hasWebUrl: !!env.WEB_URL,
    webUrl: env.WEB_URL,
  });

  const db = createDrizzle();

  authInstanceCache = betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    user: {
      additionalFields: {
        username: {
          type: "string",
          required: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            if (ADMIN_EMAILS.includes(user.email)) {
              await queries.updateUserRole(db, user.id, "admin");
              logger.info("Auto-assigned admin role to user", { email: user.email });
            }
          },
        },
      },
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        mapProfileToUser: (profile) => ({
          username: profile.login.toLowerCase(),
        }),
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

  return authInstanceCache;
}

export type Auth = ReturnType<typeof createAuth>;
