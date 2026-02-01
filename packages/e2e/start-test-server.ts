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

// Log file for server output - read by globalTeardown on failure
export const SERVER_LOG_FILE = path.join(import.meta.dirname!, ".server-output.log");

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
    fs.unlinkSync(existingDb);
  }
}

function applyMigrations() {
  execSync(`npx wrangler d1 migrations apply agentlogs --local --persist-to "${TEST_STATE_DIR}"`, {
    cwd: WEB_DIR,
    stdio: "pipe",
    env: { ...process.env, CI: "true" },
  });
}

function seedDatabase() {
  const dbPath = findSqliteFile(TEST_DB_DIR);
  if (!dbPath) {
    throw new Error("[test-server] Database not found after migrations");
  }

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  // Seed test user with "user" role (not "waitlist") so they can access /app
  db.insert(schema.user)
    .values({
      id: "test-user-id",
      name: "Test User",
      username: "testuser",
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

  // Seed second active user (non-owner for authz tests)
  db.insert(schema.user)
    .values({
      id: "other-user-id",
      name: "Other User",
      username: "otheruser",
      email: "other@example.com",
      emailVerified: true,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  db.insert(schema.session)
    .values({
      id: "other-session-id",
      userId: "other-user-id",
      token: "other-session-token",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  // Seed waitlist user for access control tests
  db.insert(schema.user)
    .values({
      id: "waitlist-user-id",
      name: "Waitlist User",
      username: "waitlistuser",
      email: "waitlist@example.com",
      emailVerified: true,
      role: "waitlist",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  db.insert(schema.session)
    .values({
      id: "waitlist-session-id",
      userId: "waitlist-user-id",
      token: "waitlist-session-token",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  // Seed transcript owned by test user for commit tracking authz checks
  db.insert(schema.transcripts)
    .values({
      id: "seed-transcript-id",
      userId: "test-user-id",
      visibility: "private",
      sha256: "a".repeat(64),
      transcriptId: "seed-transcript",
      source: "claude-code",
      createdAt: new Date(),
      costUsd: 0,
      blendedTokens: 0,
      messageCount: 1,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      cwd: "/tmp",
    })
    .run();

  sqlite.close();
}

function startViteServer() {
  // Clear previous log file
  fs.writeFileSync(SERVER_LOG_FILE, "");

  // Run cf-typegen first
  execSync("bun run cf-typegen", {
    cwd: WEB_DIR,
    stdio: "pipe",
    env: { ...process.env, VITE_USE_TEST_DB: "true" },
  });

  // Open log file for appending
  const logStream = fs.createWriteStream(SERVER_LOG_FILE, { flags: "a" });

  // Start vite dev in the foreground on port 3009 (this will keep running)
  // Use --host to bind to all interfaces so subprocess fetch can connect
  // Capture output to log file for debugging on test failure
  const vite = spawn("bun", ["run", "vite", "dev", "--port", "3009", "--host"], {
    cwd: WEB_DIR,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, VITE_USE_TEST_DB: "true" },
  });

  // Write stdout and stderr to log file
  vite.stdout?.on("data", (data) => logStream.write(data));
  vite.stderr?.on("data", (data) => logStream.write(data));

  vite.on("close", (code) => {
    logStream.close();
    process.exit(code ?? 0);
  });
}

// Main
deleteExistingDatabase();
applyMigrations();
seedDatabase();
startViteServer();
