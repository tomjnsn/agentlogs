import { createMiddleware, createStart } from "@tanstack/react-start";
import { logger } from "./lib/logger";

// TEMPORARILY DISABLED: Sentry is not compatible with Cloudflare Workers when using @sentry/tanstackstart-react
// import * as Sentry from "@sentry/tanstackstart-react";

const loggingMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const response = await next();
    return response;
  } catch (error) {
    logger.error("Request failed in middleware", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [loggingMiddleware],
  };
});
