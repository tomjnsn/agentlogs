import { deviceAuthorizationClient } from "better-auth/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BETTER_AUTH_URL || "http://localhost:3000",
  plugins: [deviceAuthorizationClient()],
});

// Export hooks for convenient use in components
export const { useSession } = authClient;
