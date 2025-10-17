// DEBUGGING: Direct console.log at the very top before any imports
console.log("🟡 START.TS: Top of file, before imports");

// TEMPORARILY DISABLED: Sentry is not compatible with Cloudflare Workers when using @sentry/tanstackstart-react
// import * as Sentry from "@sentry/tanstackstart-react";

console.log("🟡 START.TS: After Sentry import (disabled)");

import { createMiddleware, createStart } from "@tanstack/react-start";

console.log("🟡 START.TS: After TanStack import");

import { logger } from "./lib/logger";

console.log("🟡 START.TS: After logger import");

// Log at module initialization to verify code is running (using both console and logger)
console.log("🚀 start.ts module loaded - direct console.log");
logger.info("start.ts module loaded");

const loggingMiddleware = createMiddleware().server(async ({ next }) => {
  console.log("🔵 Request received");
  logger.info("Request received");
  try {
    const response = await next();
    console.log("🟢 Request completed");
    logger.info("Request completed");
    return response;
  } catch (error) {
    console.error("🔴 Request failed in middleware", error);
    logger.error("Request failed in middleware", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
});

console.log("🟡 START.TS: Sentry middleware disabled");

export const startInstance = createStart(() => {
  console.log("⚡ createStart called");
  logger.info("createStart called");
  return {
    requestMiddleware: [loggingMiddleware],
  };
});
