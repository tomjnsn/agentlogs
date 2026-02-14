import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import devtoolsJson from "vite-plugin-devtools-json";
import tsconfigPaths from "vite-tsconfig-paths";
import { consoleToFile } from "./src/vite-plugins/console-to-file";
import { requestLogger } from "./src/vite-plugins/request-logger";
import { websocketLogger } from "./src/vite-plugins/websocket-logger";

export default defineConfig({
  build: {
    sourcemap: true,
  },
  ssr: {
    noExternal: true,
    external: ["better-sqlite3"],
  },
  server: {
    port: 3000,
  },
  optimizeDeps: {
    // Hold optimization until all static imports are crawled on cold start
    // This prevents full-page reloads when new dependencies are discovered
    holdUntilCrawlEnd: true,
  },
  plugins: [
    consoleToFile(), // Must be first to intercept all console output
    websocketLogger(), // Handle client-side logs via WebSocket
    requestLogger(),
    devtoolsJson({
      projectRoot: path.resolve(__dirname, "../.."), // monorepo root
    }),
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
