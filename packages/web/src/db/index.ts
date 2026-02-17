import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { logger } from "../lib/logger";
import * as schema from "./schema";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return url;
}

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Creates or returns the singleton Drizzle instance for the PostgreSQL database.
 * Uses postgres.js driver for self-hosted deployment.
 */
export function createDrizzle() {
  if (!dbInstance) {
    const enableSqlLogging = process.env.DEBUG_SQL === "true";
    const client = postgres(getDatabaseUrl());

    dbInstance = drizzle(client, {
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
  return dbInstance;
}

export type DrizzleDB = ReturnType<typeof createDrizzle>;
