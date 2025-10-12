#!/usr/bin/env bun

import type { SessionEndHookInput } from '@anthropic-ai/claude-code';
import type { TranscriptEvent } from '@vibeinsights/shared';
import { readFileSync } from 'fs';
import { uploadTranscript, getRepoMetadata } from '../src/upload';

// ✅ Use SDK type directly - no Zod needed
const input = await Bun.stdin.json() as SessionEndHookInput;
const { session_id, transcript_path, cwd, reason } = input;

// Configuration
const UPLOAD_ENABLED = process.env.VI_UPLOAD_ENABLED !== 'false';

try {
  if (!UPLOAD_ENABLED) {
    console.log('⊘ VI upload disabled (set VI_UPLOAD_ENABLED=true to enable)');
    process.exit(0);
  }

  // Read and parse transcript file
  // TypeScript provides compile-time safety, server does runtime validation
  const transcriptContent = readFileSync(transcript_path, 'utf8');
  const events = transcriptContent
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line) as TranscriptEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is TranscriptEvent => event !== null);

  if (events.length === 0) {
    console.log('⊘ No events in transcript');
    process.exit(0);
  }

  // Get repository metadata
  const { repoId, repoName } = getRepoMetadata(cwd);

  // Upload to server (server validates)
  const result = await uploadTranscript({
    repoId,
    repoName,
    sessionId: session_id,
    events, // Raw events, server handles validation
    metadata: { cwd, reason, eventCount: events.length },
  });

  if (result.success) {
    console.log(`✓ Uploaded ${events.length} events to Vibe Insights (ID: ${result.transcriptId})`);
  } else {
    console.error('✗ Failed to upload transcript to Vibe Insights server');
  }
} catch (error) {
  if (error instanceof Error) {
    console.error('✗ Hook error:', error.message);
  }
} finally {
  // Always exit successfully (fail-open architecture)
  // Never block Claude Code from exiting
  process.exit(0);
}
