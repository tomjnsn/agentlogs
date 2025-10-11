import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for Cloudflare D1
 *
 * For local development:
 * - Migration generation: Uses this simple config (no database connection needed)
 * - Migration apply: Uses `wrangler d1 migrations apply aei --local`
 * - Drizzle Studio: Uses DB_LOCAL_PATH env var to connect to local SQLite file
 *
 * For production:
 * - Migration apply: Uses `wrangler d1 migrations apply aei --remote`
 */
export default process.env.DB_LOCAL_PATH
  ? defineConfig({
      schema: './src/db/schema.ts',
      dialect: 'sqlite',
      dbCredentials: {
        url: process.env.DB_LOCAL_PATH,
      },
    })
  : defineConfig({
      schema: './src/db/schema.ts',
      out: './migrations',
      dialect: 'sqlite',
      verbose: true,
      strict: true,
    });
