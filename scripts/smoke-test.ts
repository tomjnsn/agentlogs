#!/usr/bin/env bun
/**
 * Smoke Test: Verifies the POC works end-to-end
 *
 * Usage: bun scripts/smoke-test.ts
 *
 * Validates:
 * - Server starts and responds
 * - API accepts transcript upload
 * - Database stores data
 * - Analysis runs
 * - Web UI is accessible
 *
 * Exit codes: 0=pass, 1=fail
 */

const SERVER_URL = process.env.AEI_SERVER_URL || 'http://localhost:3000';
const API_TOKEN = process.env.AEI_API_TOKEN || 'dev_token';

// Minimal mock transcript (2 events = enough to test retry detection)
const mockTranscript = {
  repoId: 'https://github.com/test/smoke-test',
  repoName: 'smoke-test',
  sessionId: `smoke-${Date.now()}`,
  events: [
    {
      sessionId: 'smoke',
      uuid: '1',
      timestamp: new Date().toISOString(),
      type: 'user',
      message: { role: 'user', content: 'test' },
      cwd: '/tmp',
      parentUuid: null,
    },
    {
      sessionId: 'smoke',
      uuid: '2',
      timestamp: new Date().toISOString(),
      type: 'tool_use',
      tool_name: 'Read',
      tool_input: { file_path: 'test.ts' },
    },
    {
      sessionId: 'smoke',
      uuid: '3',
      timestamp: new Date().toISOString(),
      type: 'tool_use',
      tool_name: 'Read', // Duplicate = tests retry detection
      tool_input: { file_path: 'test.ts' },
    },
  ],
  metadata: { cwd: '/tmp', reason: 'test', eventCount: 3 },
};

async function main() {
  console.log('🔥 Running smoke test...\n');

  try {
    // 1. Health check
    process.stdout.write('  Server health... ');
    const health = await fetch(`${SERVER_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) throw new Error(`Health check failed: ${health.status}`);
    console.log('✓');

    // 2. Upload transcript
    process.stdout.write('  Upload transcript... ');
    const upload = await fetch(`${SERVER_URL}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(mockTranscript),
      signal: AbortSignal.timeout(5000),
    });
    if (!upload.ok) throw new Error(`Upload failed: ${upload.status}`);
    const { transcriptId } = await upload.json();
    console.log('✓');

    // 3. Wait for async analysis (setTimeout in api.ts)
    process.stdout.write('  Async analysis... ');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✓');

    // 4. Retrieve transcript with analysis
    process.stdout.write('  Retrieve data... ');
    const retrieve = await fetch(`${SERVER_URL}/api/transcripts/${transcriptId}`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!retrieve.ok) throw new Error(`Retrieve failed: ${retrieve.status}`);
    const data = await retrieve.json();
    if (!data.transcript) throw new Error('Missing transcript');
    if (!data.analysis) throw new Error('Analysis did not run');
    if (data.analysis.metrics.retries !== 1) throw new Error('Retry detection failed');
    console.log('✓');

    // 5. Web UI
    process.stdout.write('  Web UI... ');
    const ui = await fetch(`${SERVER_URL}/`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!ui.ok) throw new Error(`Web UI failed: ${ui.status}`);
    console.log('✓');

    console.log('\n✅ All checks passed\n');
    process.exit(0);
  } catch (error) {
    console.log('✗');
    console.error(`\n❌ Smoke test failed: ${error instanceof Error ? error.message : error}`);
    console.error('\nTroubleshooting:');
    console.error('  - Is server running? pnpm dev');
    console.error('  - Check logs in server terminal');
    console.error('  - Try: curl http://localhost:3000/health\n');
    process.exit(1);
  }
}

main();
