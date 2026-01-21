import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { init } from "@paralleldrive/cuid2";

const CONFIG_DIR = join(homedir(), ".config", "agentlogs");
const DB_FILE = join(CONFIG_DIR, "local.db");

const isBun = typeof globalThis.Bun !== "undefined";

interface DbWrapper {
  exec(sql: string): void;
  get(sql: string, ...params: unknown[]): unknown;
  run(sql: string, ...params: unknown[]): void;
  all(sql: string, ...params: unknown[]): unknown[];
}

let db: DbWrapper | null = null;
let cuidGenerator: (() => string) | null = null;

/**
 * Get the CUID2 generator
 */
function getCuidGenerator(): () => string {
  if (!cuidGenerator) {
    cuidGenerator = init();
  }
  return cuidGenerator!;
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Get or create the SQLite database connection
 */
async function getDb(): Promise<DbWrapper> {
  if (db) {
    return db;
  }

  ensureConfigDir();

  if (isBun) {
    // Use bun:sqlite
    const { Database } = await import("bun:sqlite");
    const bunDb = new Database(DB_FILE);
    db = {
      exec: (sql) => bunDb.run(sql),
      get: (sql, ...params) => bunDb.query(sql).get(...(params as (string | number | boolean | null)[])),
      run: (sql, ...params) => bunDb.run(sql, params as (string | number | boolean | null)[]),
      all: (sql, ...params) => bunDb.query(sql).all(...(params as (string | number | boolean | null)[])),
    };
  } else {
    // Use better-sqlite3
    const BetterSqlite3 = (await import("better-sqlite3")).default;
    const nodeDb = new BetterSqlite3(DB_FILE);
    db = {
      exec: (sql) => nodeDb.exec(sql),
      get: (sql, ...params) => nodeDb.prepare(sql).get(...params),
      run: (sql, ...params) => nodeDb.prepare(sql).run(...params),
      all: (sql, ...params) => nodeDb.prepare(sql).all(...params),
    };
  }

  // Create KV table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  return db;
}

/**
 * Memento-style local store interface
 */
export interface LocalStore {
  get<T>(key: string): Promise<T | undefined>;
  get<T>(key: string, defaultValue: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

/**
 * Get the local store instance
 */
export function getLocalStore(): LocalStore {
  return {
    async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
      const database = await getDb();
      const row = database.get("SELECT value FROM kv WHERE key = ?", key) as { value: string } | undefined;
      if (!row) {
        return defaultValue;
      }
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return defaultValue;
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      const database = await getDb();
      const jsonValue = JSON.stringify(value);
      database.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", key, jsonValue);
    },

    async delete(key: string): Promise<void> {
      const database = await getDb();
      database.run("DELETE FROM kv WHERE key = ?", key);
    },

    async keys(prefix?: string): Promise<string[]> {
      const database = await getDb();
      if (prefix) {
        const rows = database.all("SELECT key FROM kv WHERE key LIKE ?", `${prefix}%`) as {
          key: string;
        }[];
        return rows.map((r) => r.key);
      }
      const rows = database.all("SELECT key FROM kv") as { key: string }[];
      return rows.map((r) => r.key);
    },
  };
}

/**
 * Get or create a stable CUID2 ID for a transcript.
 * If we've seen this transcriptId before, returns the cached ID.
 * Otherwise, generates a new ID and caches it.
 */
export async function getOrCreateTranscriptId(transcriptId: string): Promise<string> {
  const store = getLocalStore();
  const key = `transcript.${transcriptId}.id`;

  const existingId = await store.get<string>(key);
  if (existingId) {
    return existingId;
  }

  const newId = getCuidGenerator()();
  await store.set(key, newId);
  return newId;
}

/**
 * Cache a transcript ID mapping (used when server returns an existing ID)
 */
export async function cacheTranscriptId(transcriptId: string, id: string): Promise<void> {
  const store = getLocalStore();
  const key = `transcript.${transcriptId}.id`;
  await store.set(key, id);
}
