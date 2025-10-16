import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Cache router instance to avoid recreation during concurrent SSR requests
// This prevents module initialization race conditions with circular imports
let routerInstance: ReturnType<typeof createTanStackRouter> | undefined;

export function getRouter() {
  if (!routerInstance) {
    routerInstance = createTanStackRouter({
      routeTree,
      defaultPreload: "intent",
      scrollRestoration: true,
    });
  }
  return routerInstance;
}
