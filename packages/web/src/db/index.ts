import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

/**
 * Creates a Drizzle instance for the given D1 database
 * This is called per-request in the Cloudflare Workers environment
 */
export function createDrizzle(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type DrizzleDB = ReturnType<typeof createDrizzle>
