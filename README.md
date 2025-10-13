# Vibe Insights (VI)

Capture and analyze Claude Code transcripts to understand how your team uses AI coding assistants.

## What It Does

- **Plugin**: Captures Claude Code session transcripts automatically
- **Web App**: Full-stack application that stores transcripts, analyzes patterns, and displays insights

## Tech Stack

- **Framework**: TanStack Start (full-stack React with SSR)
- **Runtime**: Cloudflare Workers (edge compute)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **ORM**: Drizzle ORM (type-safe queries + migrations)
- **Auth**: BetterAuth (GitHub OAuth)
- **Routing**: TanStack Router (file-based, type-safe)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Package Manager**: Bun (monorepo with workspaces)

## Project Structure

```
vibeinsights/
├── packages/
│   ├── shared/         # Shared TypeScript types + Zod schemas
│   ├── plugin/         # Claude Code plugin (captures transcripts)
│   └── web/            # TanStack Start full-stack application
│       ├── src/
│       │   ├── db/         # Database schema, queries, connection
│       │   ├── lib/        # Auth, analyzer, server functions
│       │   ├── routes/     # File-based routes + API endpoints
│       │   ├── components/ # React components
│       │   └── scripts/    # Database migration scripts
│       ├── data/           # SQLite database (gitignored)
│       └── migrations/     # Drizzle migrations
├── package.json        # Root workspace config
└── README.md          # This file
```

## Quick Start

### Prerequisites

- **Bun** v1.3.0+ ([install](https://bun.sh/))
- **GitHub OAuth App** (for authentication):
  1. Go to https://github.com/settings/developers
  2. Create new OAuth app:
     - Homepage URL: `http://localhost:8787`
     - Callback URL: `http://localhost:8787/api/auth/callback/github`
  3. Save Client ID and Client Secret

### Setup (< 2 minutes)

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cd packages/web
cp .dev.vars.example .dev.vars
# Edit .dev.vars - add your GitHub OAuth credentials

# 3. Set up database
bun db:setup

# 4. Start the application
bun dev
# Auto-generates types and starts Wrangler dev server

# 5. Visit the application
open http://localhost:8787
```

## Environment Variables

**Web App** (`packages/web/.dev.vars`):

```bash
# GitHub OAuth credentials
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-secret-here

# Application URLs (wrangler dev uses port 8787)
BETTER_AUTH_URL=http://localhost:8787
WEB_URL=http://localhost:8787

# API token for Claude Code plugin
API_TOKEN=dev_token
```

## Available Commands

```bash
# Development (from packages/web)
bun dev               # ⭐ Start the application (auto-migrates database)
bun run build         # Build for production
bun start             # Start production server

# Database (from packages/web)
bun db:setup          # Setup database (generate + apply migrations)
bun db:generate       # Generate migrations from schema changes
bun db:migrate        # Run pending migrations
bun db:studio         # Open Drizzle Studio (GUI on port 4983)

# Root commands
bun install           # Install all dependencies
```

## Database

**Tables** (7 total):

- Auth: `user`, `session`, `account`, `verification` (BetterAuth)
- VI: `repos`, `transcripts`, `analysis`

**Location**:

- Development: `packages/web/.wrangler/state/v3/d1/*.sqlite`
- Production: Cloudflare D1

**Migrations**: Managed by Drizzle ORM + Wrangler

## Authentication

**Dual authentication**:

1. **Web UI**: GitHub OAuth (BetterAuth) - session-based
2. **Plugin**: API token (Bearer authentication) - for `/api/ingest` endpoint

All data is isolated by `userId` (multi-tenant).

**API Endpoints**:

- `POST /api/ingest` - Accepts transcript data from Claude Code plugin
- `GET|POST /api/auth/*` - BetterAuth authentication handlers

**Server Functions** (RPC-style, called from route loaders):

- `getRepos()` - Fetch repositories
- `getTranscriptsByRepo(repoId)` - Fetch transcripts for a repo
- `getTranscript(id)` - Fetch transcript with analysis

## Troubleshooting

### Common Issues

**Database issues?**

```bash
cd packages/web
rm -rf data/
bun db:setup
```

**Port already in use?**

```bash
# Kill existing processes
pkill -f "vite"
# Or change port in package.json
```

**Authentication issues?**

1. Verify GitHub OAuth callback URL: `http://localhost:3001/api/auth/callback/github`
2. Check that `BETTER_AUTH_SECRET` is set in `.env`
3. Clear browser cookies and try again

**Build/type errors?**

```bash
bun install
cd packages/web
bun run build
```

## Production Deployment

Deploy to Cloudflare Workers:

```bash
# From packages/web directory

# 1. Create D1 database
wrangler d1 create vibeinsights

# 2. Update wrangler.jsonc with database_id

# 3. Run migrations
bun db:migrate:remote

# 4. Set secrets
wrangler secret put API_TOKEN
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET

# 5. Deploy
bun run build
bun run deploy
```

See [packages/web/README.md](./packages/web/README.md) for detailed deployment instructions.

## Package Documentation

- [Web Application](./packages/web/README.md) - Full setup guide and architecture
- [Plugin](./packages/plugin/README.md) - Plugin installation
- [Shared Types](./packages/shared/README.md) - Shared type definitions

## Product Vision

See [product_spec.md](./product_spec.md) for detailed product vision and roadmap.

## Support

- **Issues**: Use GitHub issues for bugs
- **Questions**: Check package READMEs first
- **Logs**: `logs/` directory for development logs

---

**Ready?** Run `bun install && cd packages/web && bun db:setup && bun dev` 🚀
