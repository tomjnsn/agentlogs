/**
 * Build-time configuration constants
 * These are replaced at build time using bun build --define
 */

/**
 * Current environment (development or production)
 * Inlined at build time, defaults to development
 */
export const NODE_ENV = process.env.NODE_ENV ?? "development";

/**
 * Check if running in production environment
 */
export const isProduction = NODE_ENV === "production";

/**
 * Check if running in development environment
 */
export const isDevelopment = NODE_ENV === "development";
