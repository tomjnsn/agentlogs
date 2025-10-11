# AEI Server - Cloudflare Workers + D1

API server for Agentic Engineering Insights, built with Hono and Cloudflare D1.

## Tech Stack

- **Runtime**: Cloudflare Workers (edge computing)
- **Framework**: Hono (lightweight web framework)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **Validation**: Zod (via @hono/zod-validator)
- **Development**: Wrangler (local + remote)

## Local Development

### Prerequisites

- Bun v1.3.0+ installed
- Dependencies installed (`bun install` from root)

### Setup

1. **Install dependencies** (from project root):
   ```bash
   bun install
   ```

2. **Start development server**:
   ```bash
   cd packages/server
   bun run dev
   ```

   This runs `wrangler dev` which:
   - Starts a local Workers runtime
   - Creates a local D1 SQLite database
   - Watches for file changes (hot reload)
   - Serves on http://localhost:8787

3. **Setup database schema**:
   ```bash
   bun run db:setup
   ```

   This pushes the Drizzle schema directly to your local D1 database, creating all tables.

### Environment Variables

Local development uses `.dev.vars`. Copy the example file:

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual values
```

Required variables:
- `API_TOKEN` - Bearer token for plugin authentication
- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app client secret
- `BETTER_AUTH_SECRET` - Secret for session encryption
- `BETTER_AUTH_URL` - Server URL (http://localhost:8787 for local)

See [AUTH_SETUP.md](../../AUTH_SETUP.md) for complete setup guide.

These are automatically loaded by Wrangler.

## Available Scripts

```bash
# Development
bun run dev                    # Start Wrangler dev server

# Database (Drizzle)
bun run db:setup               # Setup local database (generate + apply migrations)
bun run db:generate            # Generate migration from schema changes
bun run db:migrate:local       # Apply migrations locally
bun run db:migrate:remote      # Apply migrations to production
bun run db:studio              # Open Drizzle Studio (database GUI)
bun run db:reset               # Reset local database (clear + reapply)

# Deployment
bun run deploy                 # Deploy to Cloudflare Workers
bun run types                  # Generate Wrangler types
bun run validate               # Run types + generate migrations

# Testing
bun run test                   # Run tests
```

## API Endpoints

All routes require `Authorization: Bearer <token>` header.

### Health Check
```
GET /health
```

### Transcript Ingestion
```
POST /api/ingest
Content-Type: application/json
Authorization: Bearer dev_token

{
  "repoId": "owner/repo",
  "repoName": "repo",
  "sessionId": "uuid",
  "events": [...],
  "metadata": { ... }
}
```

### Repository Listing
```
GET /api/repos
Authorization: Bearer dev_token
```

### Repository Transcripts
```
GET /api/repos/:id/transcripts
Authorization: Bearer dev_token
```

### Transcript Detail
```
GET /api/transcripts/:id
Authorization: Bearer dev_token
```

## Database

### Local vs Production Database Workflow

**Local Development** (migration-based):
- Uses `drizzle-kit generate` to create migration files from schema
- Uses `wrangler d1 migrations apply aei --local` to apply migrations
- Works with placeholder `database_id = "local-dev-placeholder"` in wrangler.toml
- Run: `bun run db:setup` (generates + applies migration)
- Reset: `bun run db:reset` (clears database + reruns setup)

**Production** (same workflow):
- Update `database_id` in wrangler.toml with real UUID from `wrangler d1 create aei`
- Run: `bun run db:generate` then `bun run db:migrate:remote`
- Migrations are tracked and versioned for safe production deployments

### Drizzle ORM

We use **Drizzle ORM** for type-safe database access:

**Schema Definition** (`src/db/schema.ts`):
```typescript
export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id').notNull().references(() => user.id),
  // ...
});
```

**Type-Safe Queries** (`src/db/queries.ts`):
```typescript
export async function getRepos(db: DrizzleDB, userId: string) {
  return await db
    .select()
    .from(repos)
    .where(eq(repos.userId, userId))
    .orderBy(desc(repos.lastActivity));
}
```

**Benefits**:
- Full TypeScript type safety
- Automatic schema migrations
- Relational queries with joins
- Query builder + raw SQL support
- Multi-tenancy built-in

### Schema

The database includes 7 tables:

**Auth Tables** (BetterAuth):
- `user` - User accounts
- `session` - Active sessions
- `account` - OAuth provider accounts
- `verification` - Email verification tokens

**AEI Tables**:
- `repos` - Repository metadata (linked to users)
- `transcripts` - Session transcripts with events (linked to users)
- `analysis` - Computed metrics and insights

See `src/db/schema.ts` for the complete schema definition.

## Deployment

### First-Time Setup

1. **Create GitHub OAuth App** (for production):
   - Go to https://github.com/settings/developers
   - Create OAuth app with production callback URL
   - Save Client ID and Secret

2. **Create D1 database**:
   ```bash
   wrangler d1 create aei
   ```

   Copy the database_id to `wrangler.toml`

3. **Run migrations on production database**:
   ```bash
   bun run db:migrate:remote
   ```

4. **Set production secrets**:
   ```bash
   wrangler secret put API_TOKEN
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   wrangler secret put BETTER_AUTH_SECRET
   ```

5. **Update wrangler.toml** production vars:
   ```toml
   [env.production]
   vars = {
     WEB_URL = "https://your-domain.com",
     BETTER_AUTH_URL = "https://your-api-domain.com"
   }
   ```

### Deploy

```bash
bun run deploy
```

Your API will be available at:
```
https://aei-server.<your-subdomain>.workers.dev
```

## Architecture

### Request Flow

1. Client sends request → Cloudflare edge
2. Worker receives request → Hono router
3. Auth middleware validates token
4. Route handler:
   - Accesses D1 via `c.env.DB`
   - Calls database functions (async)
   - Returns JSON response
5. Background tasks use `c.executionCtx.waitUntil()`

### Database Access Pattern

All database queries use Drizzle ORM with multi-tenant filtering:

```typescript
// lib/drizzle.ts - Factory function
export function createDrizzle(d1: D1Database) {
  return drizzle(d1, { schema });
}

// db/queries.ts - Type-safe queries
export async function getRepos(db: DrizzleDB, userId: string) {
  return await db
    .select()
    .from(repos)
    .where(eq(repos.userId, userId));
}

// api.ts - Usage in routes
api.get('/repos', authMiddleware, async (c) => {
  const userId = c.get('userId'); // From auth middleware
  const db = createDrizzle(c.env.DB);
  const repos = await queries.getRepos(db, userId);
  return c.json({ repos });
});
```

### Type Safety

- `packages/server/src/types.ts` defines the `Env` interface
- Hono is typed: `new Hono<{ Bindings: Env }>()`
- Context provides typed access: `c.env.DB`, `c.env.API_TOKEN`

## Troubleshooting

### "Database not found"

D1 auto-initializes on first request. If you see errors:
1. Check `wrangler.toml` has correct binding name (`DB`)
2. Restart dev server: `bun run dev`

### "Type errors with D1Database"

Ensure `@cloudflare/workers-types` is installed and `tsconfig.json` includes:
```json
{
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"]
  }
}
```

### "Module not found" in Workers

Workers use different module resolution. Ensure:
- All imports use `.ts` extensions (not required for local Bun)
- Dependencies are in `dependencies`, not `devDependencies`

### Local vs Production Behavior

Wrangler's local mode (`wrangler dev`) is nearly identical to production, but:
- Uses local SQLite file (in `.wrangler/state/`)
- No cold starts
- Console logs appear in terminal

## Key Features

### Multi-Tenancy

All data is isolated by user:
- Every query filters by `userId` from authenticated context
- Foreign keys link repos and transcripts to users
- Middleware provides `userId` from either API token or session

### Authentication

Dual authentication support:
- **API Token**: For Claude Code plugin (Bearer token)
- **Session**: For web UI (BetterAuth + GitHub OAuth)

See [AUTH_SETUP.md](../../AUTH_SETUP.md) for complete guide.

### Type Safety

- Drizzle generates types from schema
- All queries are type-checked at compile time
- Relations enable type-safe joins
- No runtime type errors

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Hono Documentation](https://hono.dev/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
