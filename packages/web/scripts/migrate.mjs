#!/usr/bin/env node

/**
 * Database migration runner for self-hosted deployments.
 *
 * For FRESH databases: creates all tables from the current schema snapshot.
 * For EXISTING databases: applies incremental Drizzle migrations from the journal.
 *
 * The upstream migration history can't be replayed from scratch (some migrations
 * reference columns that only exist in intermediate states), so fresh installs
 * use a complete schema snapshot instead.
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || "/data/agentlogs.db";

// Schema snapshot must be defined before any code that calls initFromSnapshot()
const SCHEMA_SQL = `
-- BetterAuth tables
CREATE TABLE IF NOT EXISTS \`user\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`username\` text NOT NULL,
  \`email\` text NOT NULL,
  \`email_verified\` integer DEFAULT 0 NOT NULL,
  \`image\` text,
  \`role\` text DEFAULT 'waitlist' NOT NULL,
  \`welcome_email_sent_at\` integer,
  \`created_at\` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  \`updated_at\` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`user_email_unique\` ON \`user\` (\`email\`);

CREATE TABLE IF NOT EXISTS \`session\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`expires_at\` integer NOT NULL,
  \`token\` text NOT NULL,
  \`created_at\` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  \`updated_at\` integer NOT NULL,
  \`ip_address\` text,
  \`user_agent\` text,
  \`user_id\` text NOT NULL REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS \`session_token_unique\` ON \`session\` (\`token\`);

CREATE TABLE IF NOT EXISTS \`account\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`account_id\` text NOT NULL,
  \`provider_id\` text NOT NULL,
  \`user_id\` text NOT NULL REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
  \`access_token\` text,
  \`refresh_token\` text,
  \`id_token\` text,
  \`access_token_expires_at\` integer,
  \`refresh_token_expires_at\` integer,
  \`scope\` text,
  \`password\` text,
  \`created_at\` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  \`updated_at\` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS \`verification\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`identifier\` text NOT NULL,
  \`value\` text NOT NULL,
  \`expires_at\` integer NOT NULL,
  \`created_at\` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  \`updated_at\` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);

CREATE TABLE IF NOT EXISTS \`device_code\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`device_code\` text NOT NULL,
  \`user_code\` text NOT NULL,
  \`user_id\` text,
  \`expires_at\` integer NOT NULL,
  \`status\` text NOT NULL,
  \`last_polled_at\` integer,
  \`polling_interval\` integer,
  \`client_id\` text,
  \`scope\` text
);

-- AgentLogs tables
CREATE TABLE IF NOT EXISTS \`repos\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`repo\` text NOT NULL,
  \`last_activity\` text,
  \`is_public\` integer,
  \`created_at\` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`repos_repo_unique\` ON \`repos\` (\`repo\`);

CREATE TABLE IF NOT EXISTS \`teams\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`owner_id\` text NOT NULL REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
  \`created_at\` integer NOT NULL,
  \`updated_at\` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);

CREATE TABLE IF NOT EXISTS \`transcripts\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`repo_id\` text REFERENCES \`repos\`(\`id\`) ON DELETE CASCADE,
  \`user_id\` text NOT NULL REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
  \`visibility\` text DEFAULT 'private' NOT NULL,
  \`shared_with_team_id\` text REFERENCES \`teams\`(\`id\`) ON DELETE SET NULL,
  \`sha256\` text NOT NULL,
  \`transcript_id\` text NOT NULL,
  \`source\` text NOT NULL,
  \`created_at\` integer NOT NULL,
  \`preview\` text,
  \`summary\` text,
  \`model\` text,
  \`client_version\` text,
  \`cost_usd\` real NOT NULL,
  \`blended_tokens\` integer NOT NULL,
  \`message_count\` integer NOT NULL,
  \`tool_count\` integer DEFAULT 0 NOT NULL,
  \`user_message_count\` integer DEFAULT 0 NOT NULL,
  \`files_changed\` integer DEFAULT 0 NOT NULL,
  \`lines_added\` integer DEFAULT 0 NOT NULL,
  \`lines_removed\` integer DEFAULT 0 NOT NULL,
  \`lines_modified\` integer DEFAULT 0 NOT NULL,
  \`transcript_version\` integer DEFAULT 1 NOT NULL,
  \`input_tokens\` integer NOT NULL,
  \`cached_input_tokens\` integer NOT NULL,
  \`output_tokens\` integer NOT NULL,
  \`reasoning_output_tokens\` integer NOT NULL,
  \`total_tokens\` integer NOT NULL,
  \`relative_cwd\` text,
  \`branch\` text,
  \`cwd\` text,
  \`preview_blob_sha256\` text,
  \`updated_at\` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_repo_transcript\` ON \`transcripts\` (\`repo_id\`, \`transcript_id\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_user_transcript\` ON \`transcripts\` (\`user_id\`, \`transcript_id\`);
CREATE INDEX IF NOT EXISTS \`idx_repo_id\` ON \`transcripts\` (\`repo_id\`);
CREATE INDEX IF NOT EXISTS \`idx_user_id\` ON \`transcripts\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_user_created_at\` ON \`transcripts\` (\`user_id\`, \`created_at\`, \`id\`);

CREATE TABLE IF NOT EXISTS \`commit_tracking\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`user_id\` text NOT NULL REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
  \`transcript_id\` text NOT NULL REFERENCES \`transcripts\`(\`id\`) ON DELETE CASCADE,
  \`repo_path\` text NOT NULL,
  \`timestamp\` text NOT NULL,
  \`commit_sha\` text,
  \`commit_title\` text,
  \`branch\` text,
  \`created_at\` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS \`idx_commit_tracking_transcript\` ON \`commit_tracking\` (\`transcript_id\`);
CREATE INDEX IF NOT EXISTS \`idx_commit_tracking_user\` ON \`commit_tracking\` (\`user_id\`);

CREATE TABLE IF NOT EXISTS \`blobs\` (
  \`sha256\` text PRIMARY KEY NOT NULL,
  \`media_type\` text NOT NULL,
  \`size\` integer NOT NULL,
  \`created_at\` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS \`transcript_blobs\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`transcript_id\` text NOT NULL REFERENCES \`transcripts\`(\`id\`) ON DELETE CASCADE,
  \`sha256\` text NOT NULL REFERENCES \`blobs\`(\`sha256\`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_transcript_blob_unique\` ON \`transcript_blobs\` (\`transcript_id\`, \`sha256\`);
CREATE INDEX IF NOT EXISTS \`idx_transcript_blobs_sha256\` ON \`transcript_blobs\` (\`sha256\`);

CREATE TABLE IF NOT EXISTS \`team_members\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`team_id\` text NOT NULL REFERENCES \`teams\`(\`id\`) ON DELETE CASCADE,
  \`user_id\` text NOT NULL REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
  \`joined_at\` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_team_members_unique\` ON \`team_members\` (\`team_id\`, \`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_team_members_user\` ON \`team_members\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_team_members_team\` ON \`team_members\` (\`team_id\`);

CREATE TABLE IF NOT EXISTS \`team_invites\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`team_id\` text NOT NULL REFERENCES \`teams\`(\`id\`) ON DELETE CASCADE,
  \`code\` text NOT NULL,
  \`expires_at\` integer NOT NULL,
  \`created_at\` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`team_invites_code_unique\` ON \`team_invites\` (\`code\`);
CREATE INDEX IF NOT EXISTS \`idx_team_invites_team\` ON \`team_invites\` (\`team_id\`);
`;
const MIGRATIONS_DIR = resolve(__dirname, "../migrations");

console.log(`[migrate] Opening database at ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create migrations tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

// Read journal
const journalPath = resolve(MIGRATIONS_DIR, "meta/_journal.json");
const journal = JSON.parse(readFileSync(journalPath, "utf-8"));

// Get applied migrations
const applied = new Set(
  db
    .prepare("SELECT tag FROM __drizzle_migrations")
    .all()
    .map((row) => row.tag),
);

// Check if this is a fresh database (no migrations applied, no app tables)
const isFresh = applied.size === 0;

if (isFresh) {
  console.log("[migrate] Fresh database detected — initializing from schema snapshot");
  initFromSnapshot();
} else {
  console.log(`[migrate] Found ${journal.entries.length} migrations, ${applied.size} already applied`);
  applyIncrementalMigrations();
}

console.log("[migrate] Done.");
db.close();

/**
 * Initialize a fresh database with the complete current schema,
 * then mark all migrations as applied.
 */
function initFromSnapshot() {
  db.transaction(() => {
    db.exec(SCHEMA_SQL);

    // Mark all migrations as applied
    const insert = db.prepare("INSERT INTO __drizzle_migrations (tag) VALUES (?)");
    for (const entry of journal.entries) {
      insert.run(entry.tag);
    }
  })();

  console.log(`[migrate] Created all tables and marked ${journal.entries.length} migrations as applied.`);
}

/**
 * Apply unapplied migrations incrementally (for existing databases).
 */
function applyIncrementalMigrations() {
  let migrationsApplied = 0;
  for (const entry of journal.entries) {
    if (applied.has(entry.tag)) {
      continue;
    }

    const sqlPath = resolve(MIGRATIONS_DIR, `${entry.tag}.sql`);
    console.log(`[migrate] Applying: ${entry.tag}`);

    const sql = readFileSync(sqlPath, "utf-8");

    // Split on statement breakpoints (Drizzle uses --> statement-breakpoint)
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // PRAGMAs can't run inside transactions, separate them
    const pragmas = statements.filter((s) => s.toUpperCase().startsWith("PRAGMA"));
    const nonPragmas = statements.filter((s) => !s.toUpperCase().startsWith("PRAGMA"));

    // Execute PRAGMAs outside transaction
    for (const pragma of pragmas) {
      db.exec(pragma);
    }

    db.transaction(() => {
      for (const statement of nonPragmas) {
        db.exec(statement);
      }
      db.prepare("INSERT INTO __drizzle_migrations (tag) VALUES (?)").run(entry.tag);
    })();

    migrationsApplied++;
  }

  console.log(`[migrate] Applied ${migrationsApplied} new migration(s).`);
}
