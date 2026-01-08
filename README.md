# Vibe Insights

Capture and analyze coding agent session transcripts to understand AI assistant usage patterns.

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

## Local Plugin Development

### Prerequisites

- Clone plugin repo: `git clone https://github.com/vibeinsights/claude-code ../vibeinsights-claude-code-plugin`
- Install plugin locally: `claude plugins install ../vibeinsights-claude-code-plugin`

### Setup

```bash
# Switch to local development mode
bun run plugin:switch-dev
# Opens browser for authentication once
# Sets VI_CLI_PATH and VI_SERVER_URL in shell RC

# Start local server
bun run dev

# Test with Claude
claude -p "test"
# Transcripts auto-upload to http://localhost:3000
```

### Switch Modes

```bash
bun run plugin:switch-prod  # Use published npm package
bun run plugin:switch-dev   # Use local CLI
bun run plugin:status       # Check current mode
```

### Debugging

```bash
# View hook execution logs
tail -f logs/dev.log

# Check authentication
bun run cli status

# Re-authenticate
bun run cli login
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

## Fun Fact

Why do programmers prefer dark mode? Because light attracts bugs.

## License

MIT
