# E2E Testing Guide

This directory contains end-to-end tests for the Vibe Insights plugin.

## Test: `e2e-real.test.ts`

A **real, full-stack E2E test** that:

- ✅ Uses real Claude Code transcript fixtures
- ✅ Invokes the actual `session-end.ts` hook script
- ✅ Runs against a real Wrangler dev server
- ✅ Verifies data in a real D1 database

### How It Works

1. **Database Forking**: Copies your dev database (`.wrangler/state`) to a test database (`.wrangler-test/state`)
2. **Test Server**: Starts Wrangler on port 8788 with the forked database
3. **Hook Execution**: Runs the real hook script with a fixture transcript
4. **Verification**: Queries the test database to verify upload and analysis

### Benefits

- **Isolated**: Your dev database (`.wrangler/state`) is never modified
- **Realistic**: Tests the actual code paths used in production
- **Preserved**: Test database remains after test for inspection

---

## Quick Start

### Prerequisites

1. **Create dev database first** (only needed once):

   ```bash
   cd packages/web
   bun db:setup
   bun dev  # Let it start, then Ctrl+C
   ```

2. **Ensure environment configured**:
   ```bash
   # Check packages/web/.dev.vars exists
   ls packages/web/.dev.vars
   ```

### Run E2E Test

```bash
# From project root
bun run test:e2e

# Or from plugin directory
cd packages/plugin
bun run test:e2e
```

**Expected output:**

```
📦 Setting up E2E test environment...
📦 Forking dev database to .wrangler-test/...
✅ Database forked successfully
🚀 Starting test server on port 8788...
✅ Test server ready

🧪 Running E2E test with session: abc-123-def...
📄 Using fixture: crud.jsonl
🔨 Invoking session-end hook...
📤 Hook output: ✓ Uploaded 27 events to Vibe Insights (ID: xyz-789)
✅ Transcript uploaded with ID: xyz-789
🔍 Verifying data in test database...
✅ Transcript found in database
✅ Analysis generated: { healthScore: 95, retryCount: 2, errorCount: 0 }
✅ Repository found

🎉 E2E test passed!
🛑 Stopping test server...
💾 Test database preserved at packages/web/.wrangler-test/
```

---

## Inspecting Test Results

### View Test Database

After the test runs, inspect the test database:

```bash
cd packages/web

# Query transcripts
wrangler d1 execute DB --local \
  --persist-to .wrangler-test/state \
  --command "SELECT * FROM transcripts ORDER BY createdAt DESC LIMIT 5"

# Query analysis
wrangler d1 execute DB --local \
  --persist-to .wrangler-test/state \
  --command "SELECT * FROM analysis LIMIT 5"

# Count records
wrangler d1 execute DB --local \
  --persist-to .wrangler-test/state \
  --command "SELECT COUNT(*) as total FROM transcripts"
```

### Open Drizzle Studio on Test DB

```bash
cd packages/web

# Start Drizzle Studio pointing to test database
# (Note: You'll need to temporarily modify drizzle.config.ts to use .wrangler-test)
bun db:studio
```

---

## Managing Test Database

### Clean Up Test Database

```bash
# Remove test database (will be recreated on next run)
rm -rf packages/web/.wrangler-test/

# Or from project root
rm -rf packages/web/.wrangler-test/
```

### Start Fresh

If you want the test to start with a clean database instead of forking:

```bash
# Remove dev database
rm -rf packages/web/.wrangler/

# Recreate it
cd packages/web
bun db:setup

# Run test (will fork fresh database)
cd ../plugin
bun run test:e2e
```

---

## Troubleshooting

### "No dev database found"

**Problem:** You see:

```
⚠️  No dev database found, starting with fresh database
   Run 'bun dev' in packages/web first to create dev database
```

**Solution:**

```bash
cd packages/web
bun db:setup
bun dev  # Start server, then Ctrl+C to stop
cd ../plugin
bun run test:e2e
```

---

### "Port 8788 already in use"

**Problem:** Test fails because port is already in use.

**Solution:**

```bash
# Find and kill process on port 8788
lsof -ti:8788 | xargs kill -9

# Or change TEST_PORT in test file
```

---

### "Server did not start in time"

**Problem:** Server takes longer than 15 seconds to start.

**Solution:**

1. Check that `wrangler` is installed: `which wrangler`
2. Increase timeout in test file (currently 15000ms)
3. Check for errors in server output

---

### Test Database Has Stale Data

**Problem:** Previous test runs left data in `.wrangler-test/`.

**Solution:**

```bash
# Clean up and re-run
rm -rf packages/web/.wrangler-test/
bun run test:e2e
```

**Or:** The test will use existing data, which can actually be useful for testing with accumulated data!

---

## Advanced Usage

### Test with Different Fixtures

Modify the test file to use different fixtures:

```typescript
// In e2e-real.test.ts
transcript_path: resolve(__dirname, "../../../fixtures/claudecode/todos.jsonl"),
// or
transcript_path: resolve(__dirname, "../../../fixtures/claudecode/compact.jsonl"),
```

### Run Multiple Tests in Parallel

Create multiple test files with different ports:

```typescript
// e2e-real-2.test.ts
const TEST_PORT = 8789; // Different port
```

### Test with Real Dev Data

The test automatically forks your dev database, so any data you have from running `bun dev` will be present in the test database. This is great for testing against realistic data!

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Setup database
        run: |
          cd packages/web
          bun db:setup

      - name: Run E2E tests
        run: bun run test:e2e
        env:
          API_TOKEN: test_token
          BETTER_AUTH_SECRET: test_secret_key_for_ci
```

---

## What Gets Tested?

✅ **Plugin Hook**

- Hook script executes without errors
- Reads fixture file correctly
- Parses JSONL events
- Extracts git repo metadata

✅ **HTTP Upload**

- Sends POST to `/api/ingest`
- Authenticates with Bearer token
- Sends properly formatted JSON payload

✅ **Server Ingestion**

- Endpoint validates request
- Creates/updates repository record
- Inserts transcript with events
- Returns success response with transcript ID

✅ **Database Persistence**

- Transcript stored in `transcripts` table
- Repository stored in `repos` table
- Analysis generated in `analysis` table
- All foreign key relationships correct

✅ **Analysis**

- Async analysis completes
- Health score calculated
- Anti-patterns detected
- Recommendations generated

---

## Files Created/Modified

```
packages/
├─ plugin/
│  ├─ test/
│  │  ├─ e2e-real.test.ts    # ← E2E test (NEW)
│  │  ├─ README.md            # ← This file (NEW)
│  │  └─ upload.test.ts       # Existing unit test
│  └─ package.json            # Added test:e2e script
│
├─ web/
│  ├─ .wrangler/              # Dev database (untouched)
│  └─ .wrangler-test/         # Test database (NEW, gitignored)
│
├─ .gitignore                 # Added .wrangler-test/
└─ package.json               # Added test:e2e script
```

---

## Summary

This E2E test provides **high confidence** that your plugin works end-to-end:

- Real hook execution
- Real server ingestion
- Real database persistence
- Real analysis generation

And it does so **safely**, without touching your dev database.

Happy testing! 🎉
