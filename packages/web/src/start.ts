import * as Sentry from "@sentry/tanstackstart-react";
import { createMiddleware, createStart } from "@tanstack/react-start";
import { logger } from "./lib/logger";

// Log at module initialization to verify code is running (using both console and logger)
console.log("🚀 start.ts module loaded - direct console.log");
logger.info("start.ts module loaded");

const loggingMiddleware = createMiddleware().server(async ({ next, data }) => {
  console.log("🔵 Request received", data.request.method, data.request.url);
  logger.info("Request received", {
    url: data.request.url,
    method: data.request.method,
  });
  try {
    const response = await next();
    console.log("🟢 Request completed", response.status);
    logger.info("Request completed", {
      status: response.status,
    });
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

const sentryMiddleware = createMiddleware().server(Sentry.sentryGlobalServerMiddlewareHandler());

export const startInstance = createStart(() => {
  console.log("⚡ createStart called");
  logger.info("createStart called");
  return {
    requestMiddleware: [loggingMiddleware, sentryMiddleware],
  };
});
