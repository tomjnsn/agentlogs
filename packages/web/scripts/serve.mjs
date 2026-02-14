#!/usr/bin/env node

/**
 * Node.js HTTP server wrapper for the TanStack Start fetch handler.
 * Serves static files from dist/client/ and proxies dynamic requests
 * to the SSR fetch handler.
 */

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3000", 10);
const CLIENT_DIR = resolve(__dirname, "../dist/client");

const serverModule = await import("../dist/server/server.js");
const handler = serverModule.default || serverModule;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json",
  ".txt": "text/plain",
};

/**
 * Try to serve a static file from dist/client/.
 * Returns true if the file was served, false otherwise.
 */
function tryServeStatic(req, res) {
  const urlPath = new URL(req.url, "http://localhost").pathname;
  const filePath = resolve(CLIENT_DIR, "." + urlPath);

  // Prevent path traversal
  if (!filePath.startsWith(CLIENT_DIR)) return false;

  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return false;

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const headers = { "Content-Type": contentType, "Content-Length": stat.size };

    // Hashed assets (in /assets/) get long cache; others get short cache
    if (urlPath.startsWith("/assets/")) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    } else {
      headers["Cache-Control"] = "public, max-age=3600";
    }

    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    // Try static files first (GET/HEAD only)
    if ((req.method === "GET" || req.method === "HEAD") && tryServeStatic(req, res)) {
      return;
    }

    // Fall through to SSR fetch handler
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `${protocol}://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: hasBody ? req : null,
      duplex: hasBody ? "half" : undefined,
    });

    const response = await (handler.fetch ? handler.fetch(request) : handler(request));

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err) {
    console.error("[serve] Request error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`[serve] AgentLogs listening on http://0.0.0.0:${PORT}`);
});
