/**
 * Starts the test server with a pre-seeded database.
 *
 * This script:
 * 1. Deletes the existing test database
 * 2. Applies migrations to create a fresh schema
 * 3. Seeds the database with test data
 * 4. Starts the vite dev server
 *
 * This ensures the database is seeded BEFORE vite reads it.
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { execSync, spawn } from "child_process";
import * as schema from "../web/src/db/schema";
import path from "path";
import fs from "fs";

const WEB_DIR = path.resolve(import.meta.dirname!, "../web");
const TEST_STATE_DIR = path.join(WEB_DIR, ".wrangler-test/state");
const TEST_DB_DIR = path.join(TEST_STATE_DIR, "v3/d1");

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

function deleteExistingDatabase() {
  const existingDb = findSqliteFile(TEST_DB_DIR);
  if (existingDb) {
    console.log(`[test-server] Deleting existing test database: ${existingDb}`);
    fs.unlinkSync(existingDb);
  }
}

function applyMigrations() {
  console.log("[test-server] Applying migrations...");
  execSync(`npx wrangler d1 migrations apply agentlogs --local --persist-to "${TEST_STATE_DIR}"`, {
    cwd: WEB_DIR,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
  console.log("[test-server] Migrations applied");
}

function seedDatabase() {
  const dbPath = findSqliteFile(TEST_DB_DIR);
  if (!dbPath) {
    throw new Error("[test-server] Database not found after migrations");
  }

  console.log(`[test-server] Seeding database: ${dbPath}`);

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  // Seed test user with "user" role (not "waitlist") so they can access /app
  db.insert(schema.user)
    .values({
      id: "test-user-id",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  // Seed test session (for auth)
  db.insert(schema.session)
    .values({
      id: "test-session-id",
      userId: "test-user-id",
      token: "test-session-token",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  // Verify seeding worked
  const userCount = sqlite.prepare("SELECT COUNT(*) as count FROM user").get() as { count: number };
  const sessionCount = sqlite.prepare("SELECT COUNT(*) as count FROM session").get() as {
    count: number;
  };
  console.log(`[test-server] Seeded ${userCount.count} users, ${sessionCount.count} sessions`);

  sqlite.close();
}

function startViteServer() {
  console.log("[test-server] Starting vite dev server...");

  // Run cf-typegen first
  execSync("bun run cf-typegen", {
    cwd: WEB_DIR,
    stdio: "inherit",
    env: { ...process.env, VITE_USE_TEST_DB: "true" },
  });

  // Start vite dev in the foreground on port 3009 (this will keep running)
  // Use --host to bind to all interfaces so subprocess fetch can connect
  const vite = spawn("bun", ["run", "vite", "dev", "--port", "3009", "--host"], {
    cwd: WEB_DIR,
    stdio: "inherit",
    env: { ...process.env, VITE_USE_TEST_DB: "true" },
  });

  vite.on("close", (code) => {
    process.exit(code ?? 0);
  });
}

// Main
deleteExistingDatabase();
applyMigrations();
seedDatabase();
startViteServer();
