# Agentic Engineering Insights (AEI)

Capture and analyze Claude Code transcripts to understand how your team uses AI coding assistants.

## What It Does

- **Plugin**: Captures Claude Code session transcripts automatically
- **Server**: Stores transcripts and analyzes patterns (retries, errors, context overflows)
- **Web UI**: Displays insights with health scores and recommendations

## Tech Stack

- **Runtime**: Cloudflare Workers (edge) + Bun (local dev)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **ORM**: Drizzle ORM (type-safe queries + migrations)
- **Auth**: BetterAuth (GitHub OAuth)
- **API**: Hono (lightweight web framework)
- **Web**: TanStack Start + React
- **Package Manager**: Bun (monorepo with workspaces)

## Project Structure

```
agentic-engineering-insights/
├── logs/               # Development logs (auto-created)
├── packages/
│   ├── shared/         # Shared TypeScript types + Zod schemas
│   ├── plugin/         # Claude Code plugin (captures transcripts)
│   ├── server/         # Hono API + D1 database + auth
│   └── web/            # TanStack Start dashboard
├── package.json        # Root workspace config
└── README.md          # This file
```

## Quick Start

### Prerequisites

- **Bun** v1.3.0+ ([install](https://bun.sh/))
- **GitHub OAuth App** (for authentication):
  1. Go to https://github.com/settings/developers
  2. Create new OAuth app:
     - Homepage URL: `http://localhost:3001`
     - Callback URL: `http://localhost:8787/api/auth/callback/github`
  3. Save Client ID and Client Secret

### Setup (< 2 minutes)

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cd packages/server
cp .dev.vars.example .dev.vars
# Edit .dev.vars - add your GitHub OAuth credentials

# 3. Setup database
cd ../..
bun run db:setup

# 4. Start services
bun run dev:all    # Starts both services with logging

# OR run separately (in separate terminals)
bun run dev        # API server → http://localhost:8787
bun run dev:web    # Web UI → http://localhost:3001

# 5. Verify
curl http://localhost:8787/health
# Expected: {"status":"ok","database":"connected","test":{"test":1}}

# 6. Visit web UI
open http://localhost:3001
```

## Environment Variables

**Server** (`packages/server/.dev.vars`):
```bash
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-secret-here

BETTER_AUTH_URL=http://localhost:8787
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
API_TOKEN=dev_token
```

**Web** (`.env`):
```bash
VITE_API_URL=http://localhost:8787
```

## Available Commands

```bash
# Development
bun run dev:all       # ⭐ Start both services (recommended)
bun run dev           # Start API server only (port 8787)
bun run dev:web       # Start web UI only (port 3001)

# Logs (use in another terminal while dev:all is running)
bun run logs          # View all logs in real-time
bun run logs:server   # View server logs only
bun run logs:web      # View web logs only
bun run logs:clear    # Clear all log files

# Database
bun run db:setup      # Setup database (generate + apply migrations)
bun run db:reset      # Reset database (clear + reapply)
bun run db:studio     # Open Drizzle Studio (GUI)

# Build & Deploy
bun run build         # Build web UI
bun run typecheck     # Type check
bun run test          # Run tests
```

## Database

**Tables** (7 total):
- Auth: `user`, `session`, `account`, `verification` (BetterAuth)
- AEI: `repos`, `transcripts`, `analysis`

**Location**:
- Local: `.wrangler/state/v3/d1/*.sqlite`
- Production: Cloudflare D1

**Migrations**: Managed by Drizzle ORM + Wrangler

## Authentication

**Dual authentication**:
1. **Web UI**: GitHub OAuth (BetterAuth)
2. **Plugin**: API token (Bearer authentication)

All data is isolated by `userId` (multi-tenant).

## Logging & Troubleshooting

### Development Logs

The project uses `concurrently` to run both services with unified logging:

**Features:**
- Color-coded console output (`[server]` in cyan, `[web]` in magenta)
- Persistent log files in `logs/` directory
- Timestamped entries for debugging
- Auto-stop all services if one fails

**Log locations:**
- `logs/server.log` - Wrangler + Hono API logs
- `logs/web.log` - Vite + React logs

**Usage:**
```bash
# Terminal 1: Start services
bun run dev:all

# Terminal 2: Monitor logs
bun run logs               # View both logs
bun run logs:server        # Server only
bun run logs:web           # Web only

# Search logs
grep "error" logs/*.log
grep "/api/transcripts" logs/server.log

# Clear old logs
bun run logs:clear
```

### Common Issues

**Database issues?**
```bash
bun run db:reset
```

**Port already in use?**
```bash
# Kill existing processes
pkill -f "wrangler dev"
pkill -f "vite"
```

**Health check fails?**
```bash
# Check server is running
curl http://localhost:8787/health

# Check database
bun run db:studio

# Check server logs for errors
bun run logs:server
```

**Services not starting?**
```bash
# Check logs for errors
cat logs/server.log
cat logs/web.log
```

## Production Deployment

```bash
# 1. Create D1 database
wrangler d1 create aei
# Copy database_id to wrangler.toml

# 2. Run migrations
bun run db:migrate:remote

# 3. Set secrets
wrangler secret put API_TOKEN
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET

# 4. Deploy
bun --filter @aei/server deploy
```

## Package Documentation

- [Server](./packages/server/README.md) - API server details
- [Plugin](./packages/plugin/README.md) - Plugin installation

## Product Vision

See [product_spec.md](./product_spec.md) for detailed product vision and roadmap.

## Support

- **Issues**: Use GitHub issues for bugs
- **Questions**: Check package READMEs first
- **Logs**: `logs/` directory for development logs

---

**Ready?** Run `bun install && bun run db:setup && bun run dev:all` 🚀
