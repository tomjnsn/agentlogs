# Vibe Insights

Capture and analyze Amp session transcripts to understand AI coding assistant usage patterns.

## What It Does

- **CLI**: Captures Amp transcripts via hooks and uploads them
- **Web App**: Stores transcripts, analyzes patterns, displays insights

## Tech Stack

TanStack Start + Cloudflare Workers + D1 (SQLite) + Drizzle ORM + BetterAuth (GitHub OAuth) + Tailwind CSS v4

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.3.0+
- GitHub OAuth App ([create one](https://github.com/settings/developers))
  - Homepage: `http://localhost:8787`
  - Callback: `http://localhost:8787/api/auth/callback/github`

### Setup

```bash
# Install
bun install

# Configure
cd packages/web
cp .dev.vars.example .dev.vars
# Edit .dev.vars with GitHub OAuth credentials

# Initialize database
bun db:setup

# Start
bun dev
```

Open http://localhost:8787

## Project Structure

```
packages/
├── cli/       # Amp transcript capture tool
├── web/       # TanStack Start app on Cloudflare Workers
└── shared/    # TypeScript types and Zod schemas
```

## Commands

```bash
# Development
bun dev              # Start web app
bun cli              # Run CLI tool

# Database (from packages/web)
bun db:setup         # Setup database
bun db:studio        # Open Drizzle Studio

# Quality
bun run lint         # Lint code
bun run format       # Format code
bun run typecheck    # Type check
```

## CLI Usage

```bash
cd packages/cli

# Authenticate
bun run start login

# Upload transcript
bun run start claudecode upload path/to/transcript.jsonl

# Hook (receives transcript via stdin)
bun run start claudecode hook
```

## Environment Variables

Create `packages/web/.dev.vars`:

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
BETTER_AUTH_SECRET=your_secret  # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:8787
WEB_URL=http://localhost:8787
API_TOKEN=dev_token
```

## Deployment

```bash
cd packages/web

# Create D1 database
wrangler d1 create vibeinsights

# Run migrations
bun db:migrate:remote

# Set secrets
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put API_TOKEN

# Deploy
bun run deploy
```

## Database Schema

**Core Tables**: `repos`, `transcripts`, `analysis`  
**Auth Tables**: `user`, `session`, `account`, `verification`, `device_code`

All data scoped by `userId` for multi-tenant isolation.

## Troubleshooting

**Database issues**: `cd packages/web && bun db:reset`  
**Auth issues**: Verify callback URL and clear cookies  
**Build errors**: `bun install && bun run typecheck`

## License

MIT
