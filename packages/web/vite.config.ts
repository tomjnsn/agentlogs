import path from "path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      persistState: true,
      configPath: "wrangler.jsonc",
    }),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
