import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.startsWith("localhost:") ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("127.0.0.1:") ||
    normalized === "[::1]" ||
    normalized.startsWith("[::1]:")
  );
}

/**
 * Resolve a user-provided hostname or URL into a canonical host and base URL.
 */
export function resolveServer(input: string): { host: string; baseURL: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Hostname is required.");
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed);
  const urlString = hasProtocol ? trimmed : `${isLocalHostname(trimmed) ? "http" : "https"}://${trimmed}`;

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid hostname: ${input}`);
  }

  if (!url.hostname) {
    throw new Error(`Invalid hostname: ${input}`);
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Hostname must not include a path, query, or fragment.");
  }

  return {
    host: url.host.toLowerCase(),
    baseURL: `${url.protocol}//${url.host.toLowerCase()}`,
  };
}

/**
 * Create an auth client for a specific environment
 */
export function createAuthClientForEnv(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [deviceAuthorizationClient()],
  });
}
