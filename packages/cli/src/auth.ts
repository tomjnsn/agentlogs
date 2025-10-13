import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { readConfig } from "./config";

/**
 * Get the base URL from config or environment variable
 */
function getBaseURL(): string {
  // Priority: env var > config file > default
  const envURL = process.env.VIBEINSIGHTS_BASE_URL;
  if (envURL) {
    return envURL;
  }

  const config = readConfig();
  if (config.baseURL) {
    return config.baseURL;
  }

  return "http://localhost:3000";
}

/**
 * Create and export the auth client
 */
export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [deviceAuthorizationClient()],
});
