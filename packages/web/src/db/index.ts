import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { logger } from "../lib/logger";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH || "/data/agentlogs.db";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Creates or returns the singleton Drizzle instance for the SQLite database.
 * Uses better-sqlite3 with WAL mode for self-hosted deployment.
 */
export function createDrizzle() {
  if (!dbInstance) {
    const enableSqlLogging = process.env.DEBUG_SQL === "true";
    const sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    dbInstance = drizzle(sqlite, {
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
