#!/usr/bin/env bun
/**
 * Verifies all mitigation fixes are applied before implementation
 *
 * Usage: bun scripts/verify-fixes.ts
 * Exit 0: All good, proceed with implementation
 * Exit 1: Fixes missing, apply them first
 */

import { existsSync } from 'fs';

console.log('🔍 Verifying mitigation fixes...\n');

let allGood = true;

// Check: Test files created
const requiredFiles = [
  'scripts/smoke-test.ts',
  'scripts/mock-transcript.ts',
  'packages/plugin/test/upload.test.ts',
  'docs/04-validation-checklist.md',
  'docs/MITIGATION_PLAN.md',
  'QUICK_START.md',
];

console.log('📁 Checking required files:');
for (const file of requiredFiles) {
  const exists = existsSync(file);
  console.log(`  ${exists ? '✓' : '✗'} ${file}`);
  if (!exists) {
    allGood = false;
  }
}

// Check: Implementation plans updated with fixes
console.log('\n📝 Checking implementation plan fixes:');

const fixes = [
  {
    file: 'docs/01-implementation-plan-infrastructure-v2.md',
    pattern: 'packages/plugin/{.claude-plugin,hooks,src}',
    description: 'Directory structure fixed (line 84)',
  },
  {
    file: 'docs/01-implementation-plan-infrastructure-v2.md',
    pattern: '@hono/zod-validator',
    description: 'Missing dependency added (line 172)',
  },
  {
    file: 'docs/02-implementation-plan-plugin-v2.md',
    pattern: 'file://${cwd}',
    description: 'URI scheme fixed (line 249)',
  },
  {
    file: 'docs/03-implementation-plan-server-v2.md',
    pattern: 'import.meta.dir',
    description: 'Database path fixed (line 206)',
  },
];

for (const fix of fixes) {
  try {
    const content = await Bun.file(fix.file).text();
    const applied = content.includes(fix.pattern);
    console.log(`  ${applied ? '✓' : '✗'} ${fix.description}`);
    if (!applied) {
      allGood = false;
    }
  } catch (error) {
    console.log(`  ✗ ${fix.description} (file not found)`);
    allGood = false;
  }
}

// Check: Root package.json will be created during setup
// (Don't check now, as it's part of infrastructure implementation)

console.log('\n' + '='.repeat(50));

if (allGood) {
  console.log('\n✅ All mitigation fixes verified!');
  console.log('\nYou can now proceed with implementation:');
  console.log('  1. pnpm install');
  console.log('  2. Follow docs/01-implementation-plan-infrastructure-v2.md');
  console.log('  3. Validate: pnpm typecheck && bun test && bun scripts/smoke-test.ts');
  console.log('');
  process.exit(0);
} else {
  console.log('\n❌ Some fixes are missing!');
  console.log('\nTo apply fixes:');
  console.log('  1. Read QUICK_START.md Step 1');
  console.log('  2. Apply all fixes listed there');
  console.log('  3. Run this script again to verify');
  console.log('\nOr see detailed fixes in:');
  console.log('  - docs/MITIGATION_PLAN.md');
  console.log('  - docs/FINAL_REVIEW.md (section: Must Do Before Implementation)');
  console.log('');
  process.exit(1);
}
