import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  // D1 migrations are applied via wrangler, not via a connection URL
  driver: 'd1-http',
})
