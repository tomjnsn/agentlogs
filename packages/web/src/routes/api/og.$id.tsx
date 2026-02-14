import { createFileRoute } from "@tanstack/react-router";

// OG image generation is disabled in self-hosted mode (requires workers-og/Cloudflare WASM).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute("/api/og/$id" as any)({
  server: {
    handlers: {
      GET: async () => {
        return new Response("OG image generation not available in self-hosted mode", {
          status: 404,
          headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
