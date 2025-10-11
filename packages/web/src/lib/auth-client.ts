import { createAuthClient } from "better-auth/react"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787"

export const authClient = createAuthClient({
  baseURL: API_URL,  // Points to http://localhost:8787
  fetchOptions: {
    credentials: 'include',  // CRITICAL: Send cookies cross-origin
  }
})

// Export hooks for convenient use in components
export const { useSession } = authClient
