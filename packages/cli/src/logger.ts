import { createLogger } from "@agentlogs/shared";

/**
 * Logger for the CLI package
 * Use this for all logging in CLI commands
 */
export const logger = createLogger("cli");
