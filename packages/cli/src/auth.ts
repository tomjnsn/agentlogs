import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

/**
 * Get the base URL from build-time inlined environment variable
 * Falls back to localhost if not defined
 */
function getBaseURL(): string {
  return process.env.SERVER_URL ?? "http://localhost:3000";
}

/**
 * Create and export the auth client
 */
export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [deviceAuthorizationClient()],
});
