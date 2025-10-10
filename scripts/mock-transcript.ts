#!/usr/bin/env bun
/**
 * Generates mock Claude Code transcript for testing
 *
 * Usage: bun scripts/mock-transcript.ts > test-transcript.jsonl
 *
 * Outputs valid JSONL that can be used to test:
 * - Plugin upload logic
 * - Server ingestion
 * - Analysis (includes retry pattern)
 */

const sessionId = 'mock-session';
const now = new Date();

const events = [
  {
    sessionId,
    uuid: 'event-1',
    timestamp: now.toISOString(),
    type: 'user',
    message: {
      role: 'user',
      content: 'Read the README file',
    },
    cwd: process.cwd(),
    parentUuid: null,
  },
  {
    sessionId,
    uuid: 'event-2',
    timestamp: new Date(now.getTime() + 1000).toISOString(),
    type: 'tool_use',
    tool_name: 'Read',
    tool_input: { file_path: 'README.md' },
  },
  {
    sessionId,
    uuid: 'event-3',
    timestamp: new Date(now.getTime() + 2000).toISOString(),
    type: 'tool_result',
    tool_name: 'Read',
    tool_response: { content: '# Mock Project\n\nThis is a test.' },
  },
  {
    sessionId,
    uuid: 'event-4',
    timestamp: new Date(now.getTime() + 3000).toISOString(),
    type: 'tool_use',
    tool_name: 'Read', // Duplicate = retry (tests analyzer)
    tool_input: { file_path: 'README.md' },
  },
  {
    sessionId,
    uuid: 'event-5',
    timestamp: new Date(now.getTime() + 4000).toISOString(),
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'I read the README file. It describes a mock project.',
        },
      ],
    },
  },
];

// Output as JSONL (one JSON object per line)
for (const event of events) {
  console.log(JSON.stringify(event));
}
