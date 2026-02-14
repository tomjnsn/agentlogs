FROM oven/bun:1.3 AS build

WORKDIR /app

# Copy workspace config and package files for dependency installation
COPY package.json bun.lock ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/

# Install dependencies (skip native compilation - better-sqlite3 is SSR-external)
RUN bun install --ignore-scripts

# Copy source code
COPY . .

# Build the web application
RUN bun --cwd packages/web build

# Runtime stage - Node.js Alpine for native better-sqlite3
FROM node:22-alpine AS runtime

WORKDIR /app

# Set up ESM module type
RUN echo '{"type":"module"}' > package.json

# Copy built output
COPY --from=build /app/packages/web/dist dist

# Copy migration and server scripts
COPY --from=build /app/packages/web/migrations migrations
COPY --from=build /app/packages/web/scripts/migrate.mjs scripts/migrate.mjs
COPY --from=build /app/packages/web/scripts/serve.mjs scripts/serve.mjs

# Install better-sqlite3 native module for runtime
RUN npm install better-sqlite3@11.9.1

# Create data directories
RUN mkdir -p /data/storage

EXPOSE 3000

ENV DB_PATH=/data/agentlogs.db
ENV STORAGE_PATH=/data/storage
ENV PORT=3000
ENV NODE_ENV=production

# Run migrations then start server
CMD ["sh", "-c", "node scripts/migrate.mjs && node scripts/serve.mjs"]
