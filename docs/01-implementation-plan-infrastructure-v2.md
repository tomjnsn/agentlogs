# Implementation Plan: Repository Infrastructure (v2 - Simplified)

## Key Goals

1. **Minimal monorepo setup** - pnpm workspace with 2 packages only
2. **Bun-first development** - Use Bun's built-in tooling exclusively
3. **Zero build configuration** - No tsup, vite, or other bundlers needed
4. **Fast iteration** - Hot reload works out of the box
5. **Type safety** - Strict TypeScript throughout

## Constraints

- **POC focus**: Absolute minimum to get working
- **2 packages only**: plugin + server (server contains everything else)
- **No build tools**: Use Bun's native TypeScript execution
- **No linting/formatting tools**: Use Bun's built-in formatter
- **SQLite only**: No PostgreSQL, Redis, or external databases

## Integration Points

### Outbound (what this provides)
- **Monorepo structure**: Clean workspace setup with pnpm
- **Shared TypeScript config**: Single base config, simple package configs
- **Development scripts**: One command to run everything
- **Testing infrastructure**: Bun's built-in test runner

### Inbound (what this consumes)
- **None**: Infrastructure is foundational

## Step-by-Step Implementation

### Phase 1: Core Setup (30 minutes)

#### Step 1: Initialize Root
```bash
cd /Users/val/Desktop/sourcegraph-root/agentic-engineering-insights

# Create workspace config
cat > pnpm-workspace.yaml << EOF
packages:
  - 'packages/*'
EOF

# Create root package.json
cat > package.json << EOF
{
  "name": "agentic-engineering-insights",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev": "bun run --watch packages/server/src/index.ts",
    "dev:plugin": "cd packages/plugin && bun run --watch src/index.ts",
    "test": "bun test",
    "fmt": "bun fmt"
  }
}
EOF
```

#### Step 2: Create Base TypeScript Config
```bash
cat > tsconfig.base.json << EOF
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["bun-types"]
  }
}
EOF
```

#### Step 3: Create Package Directories
```bash
mkdir -p packages/plugin/{.claude-plugin,hooks,src} packages/server/src
```

### Phase 2: Plugin Package Setup (20 minutes)

#### Step 1: Create Plugin Package
```bash
cd packages/plugin

# Create plugin directory structure
mkdir -p .claude-plugin hooks src

# Create plugin manifest
cat > .claude-plugin/plugin.json << EOF
{
  "name": "aei-transcript-logger",
  "version": "0.1.0",
  "description": "Captures Claude Code transcripts for AEI analysis",
  "author": {
    "name": "AEI Team"
  },
  "hooks": "./hooks/hooks.json"
}
EOF

# Create hooks configuration
cat > hooks/hooks.json << EOF
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \${CLAUDE_PLUGIN_ROOT}/hooks/session-end.ts"
          }
        ]
      }
    ]
  }
}
EOF

# Create package.json
cat > package.json << EOF
{
  "name": "@aei/plugin",
  "version": "0.1.0",
  "type": "module",
  "description": "AEI transcript capture plugin for Claude Code",
  "main": "./hooks/session-end.ts",
  "dependencies": {
    "@anthropic-ai/claude-code": "^1.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
EOF

cat > tsconfig.json << EOF
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*", "hooks/**/*"]
}
EOF
```

### Phase 3: Server Package Setup (15 minutes)

#### Step 1: Create Server Package
```bash
cd packages/server

cat > package.json << EOF
{
  "name": "@aei/server",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/zod-validator": "^0.2.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
EOF

cat > tsconfig.json << EOF
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
EOF
```

#### Step 2: Create Database File
```bash
cat > src/db/index.ts << EOF
import { Database } from 'bun:sqlite';

export const db = new Database('aei.db');

// Initialize tables
db.run(\`
  CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    data TEXT
  )
\`);

db.run(\`
  CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    session_id TEXT,
    events TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
\`);
EOF
```

### Phase 4: Environment Setup (10 minutes)

#### Step 1: Create Environment Files
```bash
cd /Users/val/Desktop/sourcegraph-root/agentic-engineering-insights

cat > .env.example << EOF
# Server
PORT=3000
API_TOKEN=dev_token_change_in_production

# Development
NODE_ENV=development
LOG_LEVEL=info
EOF

cp .env.example .env
```

#### Step 2: Create .gitignore
```bash
cat > .gitignore << EOF
# Dependencies
node_modules/

# Build outputs
dist/
*.tsbuildinfo

# Environment
.env
.env.local

# Database
*.db
*.db-shm
*.db-wal

# IDE
.vscode/
.idea/

# OS
.DS_Store

# Logs
*.log
EOF
```

### Phase 5: Development Scripts (5 minutes)

#### Step 1: Create Helper Scripts
```bash
mkdir -p scripts

cat > scripts/reset-db.ts << EOF
#!/usr/bin/env bun
import { unlink } from 'fs/promises';

await unlink('packages/server/aei.db').catch(() => {});
console.log('Database reset complete');
EOF

chmod +x scripts/reset-db.ts
```

#### Step 2: Create README
```bash
cat > README.md << EOF
# Agentic Engineering Insights

## Quick Start

\`\`\`bash
# Install dependencies
pnpm install

# Start server
pnpm dev

# In another terminal, start plugin development
pnpm dev:plugin
\`\`\`

## Project Structure

\`\`\`
agentic-engineering-insights/
├── packages/
│   ├── plugin/          # Claude Code plugin
│   └── server/          # API + Analyzer + Web (all in one)
│       ├── src/
│       │   ├── api/     # API routes
│       │   ├── analyzer/# Analysis logic
│       │   ├── web/     # Web pages
│       │   ├── db/      # Database setup
│       │   └── types.ts # All types
├── scripts/             # Helper scripts
└── pnpm-workspace.yaml
\`\`\`

## Development

- \`pnpm dev\` - Start server with hot reload
- \`pnpm test\` - Run all tests
- \`pnpm fmt\` - Format code
- \`bun scripts/reset-db.ts\` - Reset database
\`\`\`
EOF
```

## File Structure

```
agentic-engineering-insights/
├── packages/
│   ├── plugin/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   ├── hooks/
│   │   │   ├── hooks.json
│   │   │   └── session-end.ts
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   └── upload.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   └── server/
│       ├── src/
│       │   ├── types.ts
│       │   ├── db.ts
│       │   ├── api.ts
│       │   ├── analyzer.ts
│       │   ├── web.tsx
│       │   └── index.ts
│       ├── aei.db
│       ├── package.json
│       └── tsconfig.json
├── scripts/
│   └── reset-db.ts
├── docs/
│   ├── 01-implementation-plan-infrastructure-v2.md
│   ├── 02-implementation-plan-plugin-v2.md
│   ├── 03-implementation-plan-server-v2.md
│   └── 04-validation-checklist.md
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── product_spec.md
└── README.md
```

## Key Differences from v1

### ✅ Simplified

1. **2 packages instead of 5**
   - Removed: `shared`, `analyzer`, `web` as separate packages
   - Merged into `server` package

2. **No build tools**
   - Removed: tsup, vite, vinxi, esbuild configs
   - Using: Bun's native TypeScript execution

3. **SQLite instead of PostgreSQL**
   - Removed: Docker, connection pooling, migrations
   - Using: Bun's built-in SQLite

4. **No linting/formatting tools**
   - Removed: ESLint, Prettier configs
   - Using: `bun fmt`

5. **Flat file structure**
   - Removed: Deep nesting (8+ files for one feature)
   - Using: Single files per concern (~300 lines each)

### ⏱️ Time Savings

- **v1 setup time**: 4-6 hours
- **v2 setup time**: 1 hour
- **Time saved**: 3-5 hours

### 📊 Complexity Reduction

- **Config files**: 15+ → 5
- **Dependencies**: 40+ → 10
- **Package boundaries**: 5 → 2
- **Total files**: 50+ → 15

## Testing Checklist

### Initial Setup
- [ ] `pnpm install` completes without errors
- [ ] Both packages have valid `package.json`
- [ ] TypeScript compilation works: `bun build src/index.ts`
- [ ] Database initializes: `bun src/db/index.ts`

### Development Workflow
- [ ] `pnpm dev` starts server with hot reload
- [ ] Changes to `.ts` files trigger reload
- [ ] Tests run: `bun test`
- [ ] Formatting works: `bun fmt`

### Cross-Package Integration
- [ ] Server can be run independently
- [ ] Plugin can be run independently
- [ ] No circular dependencies

## Success Criteria

1. **Setup completes in < 1 hour**
2. **Hot reload works perfectly**
3. **Zero configuration needed** (works out of the box)
4. **Clear structure** (easy to navigate)
5. **Fast iteration** (changes reflect immediately)

## Next Steps

After infrastructure is complete:

1. **Implement plugin** - Follow `docs/02-implementation-plan-plugin-v2.md`
2. **Implement server** - Follow `docs/03-implementation-plan-server-v2.md`
3. **Validate** - Run `pnpm typecheck && bun test && bun scripts/smoke-test.ts`

---

**Time to Complete**: 1 hour
**Next**: Follow `docs/02-implementation-plan-plugin-v2.md`
