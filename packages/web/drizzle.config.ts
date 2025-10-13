import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  // For Drizzle Studio, use local SQLite file
  // D1 migrations are applied via wrangler, not via a connection URL
  dbCredentials: {
    url: process.env.DB_LOCAL_PATH || "file:local.db",
  },
});
