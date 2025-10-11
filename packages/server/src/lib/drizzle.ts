import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

/**
 * Creates a Drizzle ORM client for the D1 database
 * This is a factory function called per-request in Cloudflare Workers
 */
export function createDrizzle(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DrizzleDB = ReturnType<typeof createDrizzle>;
