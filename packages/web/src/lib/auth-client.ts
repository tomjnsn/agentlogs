import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000", // Same origin - no longer cross-origin
});

// Export hooks for convenient use in components
export const { useSession } = authClient;
