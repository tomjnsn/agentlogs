#!/usr/bin/env node

/**
 * SQLite to PostgreSQL data migration script.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate-sqlite-to-pg.mjs <path-to-sqlite.db>
 *
 * Prerequisites:
 *   - PostgreSQL database must exist with schema already applied (run db:migrate first)
 *   - SQLite database file must be accessible
 *
 * This script:
 *   - Reads all data from SQLite
 *   - Converts unix timestamps (seconds and milliseconds) to Date objects
 *   - Converts integer booleans (0/1) to true/false
 *   - Inserts data in FK-safe order
 */

import Database from "better-sqlite3";
import postgres from "postgres";

const SQLITE_PATH = process.argv[2];
const DATABASE_URL = process.env.DATABASE_URL;

if (!SQLITE_PATH) {
  console.error("Usage: DATABASE_URL=postgres://... node scripts/migrate-sqlite-to-pg.mjs <sqlite-db-path>");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

console.log(`[migrate-data] Reading from SQLite: ${SQLITE_PATH}`);
console.log(`[migrate-data] Writing to PostgreSQL: ${DATABASE_URL.replace(/\/\/.*@/, "//***@")}`);

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const pg = postgres(DATABASE_URL);

// Helper: convert unix seconds to Date
function fromUnixSeconds(val) {
  if (val == null) return null;
  return new Date(val * 1000);
}

// Helper: convert unix milliseconds to Date
function fromUnixMs(val) {
  if (val == null) return null;
  return new Date(val);
}

// Helper: convert integer boolean to boolean
function toBool(val) {
  if (val == null) return null;
  return val === 1;
}

// Tables in FK-safe insert order
const TABLES = [
  {
    name: "user",
    transform: (row) => ({
      ...row,
      email_verified: toBool(row.email_verified) ?? false,
      welcome_email_sent_at: fromUnixMs(row.welcome_email_sent_at),
      created_at: fromUnixMs(row.created_at),
      updated_at: fromUnixMs(row.updated_at),
    }),
  },
  {
    name: "session",
    transform: (row) => ({
      ...row,
      expires_at: fromUnixMs(row.expires_at),
      created_at: fromUnixMs(row.created_at),
      updated_at: fromUnixMs(row.updated_at),
    }),
  },
  {
    name: "account",
    transform: (row) => ({
      ...row,
      access_token_expires_at: fromUnixMs(row.access_token_expires_at),
      refresh_token_expires_at: fromUnixMs(row.refresh_token_expires_at),
      created_at: fromUnixMs(row.created_at),
      updated_at: fromUnixMs(row.updated_at),
    }),
  },
  {
    name: "verification",
    transform: (row) => ({
      ...row,
      expires_at: fromUnixMs(row.expires_at),
      created_at: fromUnixMs(row.created_at),
      updated_at: fromUnixMs(row.updated_at),
    }),
  },
  {
    name: "device_code",
    transform: (row) => ({
      ...row,
      expires_at: fromUnixMs(row.expires_at),
      last_polled_at: fromUnixMs(row.last_polled_at),
    }),
  },
  {
    name: "repos",
    transform: (row) => ({
      ...row,
      is_public: toBool(row.is_public),
      created_at: fromUnixSeconds(row.created_at),
    }),
  },
  {
    name: "teams",
    transform: (row) => ({
      ...row,
      created_at: fromUnixSeconds(row.created_at),
      updated_at: fromUnixMs(row.updated_at),
    }),
  },
  {
    name: "transcripts",
    transform: (row) => ({
      ...row,
      created_at: fromUnixSeconds(row.created_at),
      updated_at: fromUnixMs(row.updated_at),
    }),
  },
  {
    name: "commit_tracking",
    transform: (row) => ({
      ...row,
      created_at: fromUnixSeconds(row.created_at),
    }),
  },
  {
    name: "blobs",
    transform: (row) => ({
      ...row,
      created_at: fromUnixSeconds(row.created_at),
    }),
  },
  {
    name: "transcript_blobs",
    transform: (row) => row,
  },
  {
    name: "team_members",
    transform: (row) => ({
      ...row,
      joined_at: fromUnixSeconds(row.joined_at),
    }),
  },
  {
    name: "team_invites",
    transform: (row) => ({
      ...row,
      expires_at: fromUnixMs(row.expires_at),
      created_at: fromUnixSeconds(row.created_at),
    }),
  },
];

let totalRows = 0;

for (const table of TABLES) {
  const rows = sqlite.prepare(`SELECT * FROM "${table.name}"`).all();

  if (rows.length === 0) {
    console.log(`[migrate-data] ${table.name}: 0 rows (skipped)`);
    continue;
  }

  const transformed = rows.map(table.transform);

  // Insert in batches of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
    const batch = transformed.slice(i, i + BATCH_SIZE);
    const columns = Object.keys(batch[0]);
    const quotedTable = table.name === "user" ? '"user"' : table.name;

    // Build parameterized INSERT
    const valuePlaceholders = batch
      .map((_, rowIdx) => {
        const placeholders = columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`);
        return `(${placeholders.join(", ")})`;
      })
      .join(", ");

    const values = batch.flatMap((row) => columns.map((col) => row[col]));

    await pg.unsafe(
      `INSERT INTO ${quotedTable} (${columns.map((c) => `"${c}"`).join(", ")}) VALUES ${valuePlaceholders} ON CONFLICT DO NOTHING`,
      values,
    );
  }

  console.log(`[migrate-data] ${table.name}: ${rows.length} rows migrated`);
  totalRows += rows.length;
}

console.log(`[migrate-data] Done. ${totalRows} total rows migrated.`);

sqlite.close();
await pg.end();
