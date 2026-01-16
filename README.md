# 🔮 AgentLogs

Capture and analyze coding agent session transcripts to understand AI assistant usage patterns.

## What It Does

- **CLI**: Captures agent transcripts (Claude Code, Codex, OpenCode) via hooks and uploads them
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
cp packages/web/.dev.vars.example packages/web/.dev.vars
# Edit .dev.vars with GitHub OAuth credentials

# Initialize database
bun db:migrate

# Start
bun dev
```

Open http://localhost:8787

## Project Structure

```
packages/
├── cli/       # Agent transcript capture tool
├── web/       # TanStack Start app on Cloudflare Workers
├── shared/    # TypeScript types and Zod schemas
├── opencode/  # OpenCode integration
└── e2e/       # End-to-end tests
```

## Commands

```bash
# Development
bun dev              # Start web app
bun agentlogs        # Run CLI tool

# Database
bun db:migrate       # Run migrations
bun db:generate      # Generate migrations
bun db:studio        # Open Drizzle Studio
bun db:reset         # Reset database

# Quality
bun run check        # Format check, lint, and type check
bun run lint         # Lint code
bun run format       # Format code

# Testing
bun run test:e2e     # Run end-to-end tests
```

## Local Plugin Development

### Prerequisites

- Clone plugin repo: `git clone https://github.com/agentlogs/claude-code ../agentlogs-claude-code-plugin`
- Install plugin locally: `claude plugins install ../agentlogs-claude-code-plugin`

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
# Transcripts auto-upload to http://localhost:8787
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
bun agentlogs status

# Re-authenticate
bun agentlogs login
```

## CLI Usage

```bash
bun agentlogs login                              # Authenticate
bun agentlogs status                             # Check login status
bun agentlogs claudecode upload transcript.jsonl # Upload transcript
bun agentlogs claudecode sync                    # Sync all local transcripts
bun agentlogs claudecode hook                    # Hook (receives via stdin)
bun agentlogs codex upload transcript.jsonl      # Upload Codex transcript
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
wrangler d1 create agentlogs

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

**Database issues**: `bun db:reset`
**Auth issues**: Verify callback URL and clear cookies
**Build errors**: `bun install && bun run check`
