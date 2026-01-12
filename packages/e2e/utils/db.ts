import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../web/src/db/schema";
import path from "path";
import fs from "fs";

const TEST_DB_DIR = path.resolve(import.meta.dirname!, "../../web/.wrangler-test/state/v3/d1");

function findSqliteFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findSqliteFile(fullPath);
        if (found) return found;
      } else if (entry.name.endsWith(".sqlite")) {
        return fullPath;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Get a direct connection to the test SQLite database.
 * Remember to call sqlite.close() when done!
 */
export function getTestDb() {
  const dbPath = findSqliteFile(TEST_DB_DIR);

  if (!dbPath) {
    throw new Error(
      `Test database not found in ${TEST_DB_DIR}. ` +
        "Make sure the dev server has been started at least once with VITE_USE_TEST_DB=true",
    );
  }

  const sqlite = new Database(dbPath);
  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
    schema,
  };
}

export { schema };
