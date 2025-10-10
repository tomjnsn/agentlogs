# Validation Checklist

Quick validation steps for agents to verify implementation correctness.

## After Infrastructure Setup

```bash
pnpm install
# Expected: Packages installed without errors

ls packages/plugin/package.json packages/server/package.json
# Expected: Both files exist
```

## After Plugin Implementation

```bash
cd packages/plugin
bun test
# Expected: Test passed (2)
```

## After Server Implementation

```bash
cd packages/server
bun build src/index.ts
# Expected: No type errors

cd ../..
pnpm typecheck
# Expected: Both packages compile
```

## Full Integration Test

```bash
# Terminal 1: Start server
pnpm dev

# Terminal 2: Run smoke test
bun scripts/smoke-test.ts
# Expected:
#   🔥 Running smoke test...
#     Server health... ✓
#     Upload transcript... ✓
#     Async analysis... ✓
#     Retrieve data... ✓
#     Web UI... ✓
#   ✅ All checks passed
```

## Manual Browser Test (Optional)

```bash
# Server should be running
open http://localhost:3000

# Expected:
# - Home page shows "Agentic Engineering Insights"
# - Shows "smoke-test" repo in list
# - Can click through to see transcript
# - Analysis shows metrics (1 retry detected)
```

## Plugin Integration Test (Optional - Requires Claude Code)

```bash
# Set environment
export AEI_SERVER_URL=http://localhost:3000
export AEI_API_TOKEN=dev_token
export AEI_UPLOAD_ENABLED=true

# Install plugin
mkdir -p ~/.claude/plugins
cp -r packages/plugin ~/.claude/plugins/aei-transcript-logger
cd ~/.claude/plugins/aei-transcript-logger
bun install

# Run Claude Code session
claude-code
# ... do some work ...
/exit

# Verify upload in browser
open http://localhost:3000
# Should see your repo with new transcript
```

## Quick Validation Command

```bash
# One-liner to validate everything
pnpm typecheck && bun test && bun scripts/smoke-test.ts
# If all pass, implementation is correct
```

## Validation Time

- Type check: ~3 seconds
- Unit tests: ~1 second
- Smoke test: ~5 seconds
- **Total: ~10 seconds**

## Exit Codes for Automation

All validation commands return:
- **0**: Success (continue)
- **1**: Failure (fix and retry)

Perfect for CI/CD or agent-driven development loops.
