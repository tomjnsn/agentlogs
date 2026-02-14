#!/usr/bin/env node

/**
 * Node.js HTTP server wrapper for the TanStack Start fetch handler.
 * Bridges the Cloudflare Workers fetch API to a standard Node.js HTTP server.
 */

const PORT = parseInt(process.env.PORT || "3000", 10);

const serverModule = await import("../dist/server/server.js");
const handler = serverModule.default || serverModule;

const { createServer } = await import("node:http");

const server = createServer(async (req, res) => {
  try {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `${protocol}://${host}`);

    // Convert Node.js IncomingMessage to Web Request
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

    // Call the fetch handler
    const response = await (handler.fetch ? handler.fetch(request) : handler(request));

    // Write status and headers
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

    // Stream the response body
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
