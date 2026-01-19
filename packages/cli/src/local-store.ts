import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { init } from "@paralleldrive/cuid2";

const CONFIG_DIR = join(homedir(), ".config", "agentlogs");
const DB_FILE = join(CONFIG_DIR, "local.db");

let db: Database | null = null;
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
function getDb(): Database {
  if (db) {
    return db;
  }

  ensureConfigDir();
  db = new Database(DB_FILE);

  // Create KV table if it doesn't exist
  db.run(`
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
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  keys(prefix?: string): string[];
}

/**
 * Get the local store instance
 */
export function getLocalStore(): LocalStore {
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      const database = getDb();
      const row = database.query("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | null;
      if (!row) {
        return defaultValue;
      }
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return defaultValue;
      }
    },

    set<T>(key: string, value: T): void {
      const database = getDb();
      const jsonValue = JSON.stringify(value);
      database.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [key, jsonValue]);
    },

    delete(key: string): void {
      const database = getDb();
      database.run("DELETE FROM kv WHERE key = ?", [key]);
    },

    keys(prefix?: string): string[] {
      const database = getDb();
      if (prefix) {
        const rows = database.query("SELECT key FROM kv WHERE key LIKE ?").all(`${prefix}%`) as {
          key: string;
        }[];
        return rows.map((r) => r.key);
      }
      const rows = database.query("SELECT key FROM kv").all() as { key: string }[];
      return rows.map((r) => r.key);
    },
  };
}

/**
 * Get or create a stable CUID2 ID for a transcript.
 * If we've seen this transcriptId before, returns the cached ID.
 * Otherwise, generates a new ID and caches it.
 */
export function getOrCreateTranscriptId(transcriptId: string): string {
  const store = getLocalStore();
  const key = `transcript.${transcriptId}.id`;

  const existingId = store.get<string>(key);
  if (existingId) {
    return existingId;
  }

  const newId = getCuidGenerator()();
  store.set(key, newId);
  return newId;
}

/**
 * Cache a transcript ID mapping (used when server returns an existing ID)
 */
export function cacheTranscriptId(transcriptId: string, id: string): void {
  const store = getLocalStore();
  const key = `transcript.${transcriptId}.id`;
  store.set(key, id);
}
