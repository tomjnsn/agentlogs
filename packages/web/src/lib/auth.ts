import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { env } from "cloudflare:workers";
import { createDrizzle } from "../db";

/**
 * Creates a BetterAuth instance using Cloudflare bindings
 */
export function createAuth() {
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
    plugins: [bearer(), deviceAuthorization()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
