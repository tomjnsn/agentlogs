import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

export const DEV_URL = "http://localhost:3000";
export const PROD_URL = "https://agentlogs.ai";

/**
 * Create an auth client for a specific environment
 */
export function createAuthClientForEnv(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [deviceAuthorizationClient()],
  });
}
