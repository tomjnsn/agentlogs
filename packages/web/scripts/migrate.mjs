#!/usr/bin/env node

/**
 * Database migration runner for self-hosted PostgreSQL deployments.
 * Uses Drizzle's built-in migrator to apply migrations from the migrations folder.
 *
 * Migration tracking is stored in public.__drizzle_migrations (migrationsSchema: "public").
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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
  // Baseline: if schema was created via `drizzle-kit push` (not migrations),
  // the __drizzle_migrations table is empty but all tables already exist.
  // Insert a record for 0000_mysterious_ultron.sql so Drizzle skips it.
  const [{ exists: tablesExist }] = await client`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'account'
    )`;

  if (tablesExist) {
    await client`
      CREATE TABLE IF NOT EXISTS "public"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )`;

    const [row] = await client`
      SELECT count(*)::int AS count FROM "public"."__drizzle_migrations"`;

    if (row.count === 0) {
      const sqlPath = resolve(__dirname, "../migrations/0000_mysterious_ultron.sql");
      const sqlContent = readFileSync(sqlPath, "utf-8");
      const hash = createHash("sha256").update(sqlContent).digest("hex");

      await client`
        INSERT INTO "public"."__drizzle_migrations" (hash, created_at)
        VALUES (${hash}, ${1771350855294})`;

      console.log("[migrate] Inserted baseline record for 0000_mysterious_ultron.sql");
    }
  }

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
