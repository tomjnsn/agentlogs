import { createLogger } from "@vibeinsights/shared";

/**
 * Logger for the web package (server-side code)
 * Use this for all logging in API routes, server functions, and SSR code
 */
export const logger = createLogger("web");
