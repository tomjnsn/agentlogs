import { drizzle } from "drizzle-orm/d1";
import { logger } from "../lib/logger";
import * as schema from "./schema";

/**
 * Creates a Drizzle instance for the given D1 database
 * This is called per-request in the Cloudflare Workers environment
 *
 * SQL query logging can be enabled by setting DEBUG_SQL=true environment variable
 */
export function createDrizzle(d1: D1Database) {
  const enableSqlLogging = process.env.DEBUG_SQL === "true";

  return drizzle(d1, {
    schema,
    ...(enableSqlLogging && {
      logger: {
        logQuery(query: string, params: unknown[]) {
          logger.debug("SQL Query:", { query, params });
        },
      },
    }),
  });
}

export type DrizzleDB = ReturnType<typeof createDrizzle>;
