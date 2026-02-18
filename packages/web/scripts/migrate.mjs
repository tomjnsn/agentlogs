#!/usr/bin/env node

/**
 * Database migration runner for self-hosted PostgreSQL deployments.
 * Uses Drizzle's built-in migrator to apply migrations from the migrations folder.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL environment variable is required");
  process.exit(1);
}

console.log("[migrate] Connecting to PostgreSQL...");
const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client);

try {
  await migrate(db, {
    migrationsFolder: resolve(__dirname, "../migrations"),
    migrationsSchema: "public",
  });
  console.log("[migrate] Migrations applied successfully.");
} catch (error) {
  console.error("[migrate] Migration failed:", error);
  process.exit(1);
} finally {
  await client.end();
}
