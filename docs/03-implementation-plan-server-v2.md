# Implementation Plan: packages/server

## Key Goals

1. Single server package - API + Analyzer + Web together
2. Hono for HTTP - Fast, modern, simple
3. Bun SQLite - Zero-config database
4. JSX for pages - Server-rendered UI

## Constraints

- 6 files: types.ts, db.ts, api.ts, analyzer.ts, web.tsx, index.ts
- SQLite only
- Server-rendered UI (no React)
- POC focus: happy path only

## File Structure

```
packages/server/
├── src/
│   ├── types.ts
│   ├── db.ts
│   ├── api.ts
│   ├── analyzer.ts
│   ├── web.tsx
│   └── index.ts
├── aei.db
├── package.json
└── tsconfig.json
```

## Implementation

### File 1: `src/types.ts`

```typescript
import { z } from 'zod';

// Transcript Events - Validated against Claude Code format

const baseEventSchema = z.object({
  sessionId: z.string(),
  uuid: z.string(),
  timestamp: z.string(), // ISO 8601
});

// User message event
const userEventSchema = baseEventSchema.extend({
  type: z.literal('user'),
  message: z.object({
    role: z.literal('user'),
    content: z.string(),
  }),
  cwd: z.string(),
  gitBranch: z.string().optional(),
  version: z.string().optional(),
  userType: z.string().optional(),
  parentUuid: z.string().nullable(),
  isSidechain: z.boolean().optional(),
});

// Assistant message event
const assistantEventSchema = baseEventSchema.extend({
  type: z.literal('assistant'),
  message: z.object({
    role: z.literal('assistant'),
    content: z.array(z.object({
      type: z.string(),
      text: z.string().optional(),
      // May include other content types (images, tool_use, etc.)
    })),
  }),
});

// Tool use event
const toolUseEventSchema = baseEventSchema.extend({
  type: z.literal('tool_use'),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()), // Unknown JSON data
});

// Tool result event
const toolResultEventSchema = baseEventSchema.extend({
  type: z.literal('tool_result'),
  tool_name: z.string(),
  tool_response: z.record(z.unknown()), // Unknown JSON data
  success: z.boolean().optional(),
  error: z.string().optional(),
});

// Union type for all events
export const transcriptEventSchema = z.discriminatedUnion('type', [
  userEventSchema,
  assistantEventSchema,
  toolUseEventSchema,
  toolResultEventSchema,
]);

export type TranscriptEvent = z.infer<typeof transcriptEventSchema>;

// ========== API Payloads ==========

export const ingestPayloadSchema = z.object({
  repoId: z.string(),
  repoName: z.string(),
  sessionId: z.string(),
  events: z.array(transcriptEventSchema),
  metadata: z.object({
    cwd: z.string(),
    reason: z.string(),
    eventCount: z.number(),
  }).optional(),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

// ========== Database Models ==========

export interface Repo {
  id: string;
  name: string;
  url: string;
  transcript_count: number;
  last_activity: string;
}

export interface Transcript {
  id: string;
  repo_id: string;
  session_id: string;
  events: string; // JSON
  created_at: number;
  analyzed: boolean;
}

export interface Analysis {
  transcript_id: string;
  retry_count: number;
  error_count: number;
  tool_failure_rate: number;
  context_overflows: number;
  health_score: number;
  anti_patterns: string; // JSON array
  recommendations: string; // JSON array
  analyzed_at: number;
}

// ========== Analysis Results ==========

export interface AnalysisResult {
  transcriptId: string;
  metrics: {
    totalEvents: number;
    toolCalls: number;
    errors: number;
    retries: number;
    contextOverflows: number;
    duration: number;
  };
  antiPatterns: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  recommendations: string[];
  healthScore: number;
}

// ========== Web View Models ==========

export interface RepoView {
  id: string;
  name: string;
  transcriptCount: number;
  avgHealthScore: number | null;
  lastActivity: string;
}

export interface TranscriptView {
  id: string;
  sessionId: string;
  eventCount: number;
  createdAt: string;
  healthScore: number | null;
}
```

### File 2: `src/db.ts`

```typescript
import { Database } from 'bun:sqlite';
import { join } from 'path';
import type { Repo, Transcript, Analysis } from './types';

const DB_PATH = join(import.meta.dir, '..', 'aei.db');
export const db = new Database(DB_PATH);

// Initialize schema
db.run(`
  CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    transcript_count INTEGER DEFAULT 0,
    last_activity TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    session_id TEXT,
    events TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    analyzed BOOLEAN DEFAULT FALSE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS analysis (
    transcript_id TEXT PRIMARY KEY,
    retry_count INTEGER,
    error_count INTEGER,
    tool_failure_rate REAL,
    context_overflows INTEGER,
    health_score INTEGER,
    anti_patterns TEXT,
    recommendations TEXT,
    analyzed_at INTEGER
  )
`);

// Queries

export function upsertRepo(id: string, name: string, url: string): void {
  db.run(
    `INSERT INTO repos (id, name, url, last_activity)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       last_activity = datetime('now'),
       transcript_count = transcript_count + 1`,
    [id, name, url]
  );
}

export function insertTranscript(
  id: string,
  repoId: string,
  sessionId: string,
  events: string
): void {
  db.run(
    `INSERT INTO transcripts (id, repo_id, session_id, events)
     VALUES (?, ?, ?, ?)`,
    [id, repoId, sessionId, events]
  );
}

export function getRepos(): Repo[] {
  return db.query<Repo, []>('SELECT * FROM repos ORDER BY last_activity DESC').all();
}

export function getTranscriptsByRepo(repoId: string): Transcript[] {
  return db
    .query<Transcript, [string]>('SELECT * FROM transcripts WHERE repo_id = ?')
    .all(repoId);
}

export function getTranscript(id: string): Transcript | null {
  return db
    .query<Transcript, [string]>('SELECT * FROM transcripts WHERE id = ?')
    .get(id) || null;
}

export function getUnanalyzedTranscripts(): Transcript[] {
  return db
    .query<Transcript, []>('SELECT * FROM transcripts WHERE analyzed = FALSE LIMIT 100')
    .all();
}

export function insertAnalysis(
  transcriptId: string,
  retryCount: number,
  errorCount: number,
  toolFailureRate: number,
  contextOverflows: number,
  healthScore: number,
  antiPatterns: string,
  recommendations: string
): void {
  db.run(
    `INSERT INTO analysis VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    [
      transcriptId,
      retryCount,
      errorCount,
      toolFailureRate,
      contextOverflows,
      healthScore,
      antiPatterns,
      recommendations,
    ]
  );

  db.run('UPDATE transcripts SET analyzed = TRUE WHERE id = ?', [transcriptId]);
}

export function getAnalysis(transcriptId: string): Analysis | null {
  return db
    .query<Analysis, [string]>('SELECT * FROM analysis WHERE transcript_id = ?')
    .get(transcriptId) || null;
}
```

### File 3: `src/api.ts`

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ingestPayloadSchema } from './types';
import * as db from './db';
import { analyzeTranscript } from './analyzer';

const api = new Hono();

// Simple auth middleware
api.use('*', async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  const expectedToken = process.env.API_TOKEN || 'dev_token';

  if (token !== expectedToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

// POST /api/ingest - Receive transcript from plugin
api.post('/ingest', zValidator('json', ingestPayloadSchema), async (c) => {
  const payload = c.req.valid('json');

  try {
    // Generate IDs
    const transcriptId = crypto.randomUUID();
    const repoName = payload.repoId.split('/').pop() || 'unknown';

    // Store repo
    db.upsertRepo(payload.repoId, repoName, payload.repoId);

    // Store transcript
    db.insertTranscript(
      transcriptId,
      payload.repoId,
      payload.sessionId,
      JSON.stringify(payload.events)
    );

    // Analyze async (don't block response)
    setTimeout(() => {
      try {
        const result = analyzeTranscript(payload.events);
        db.insertAnalysis(
          transcriptId,
          result.metrics.retries,
          result.metrics.errors,
          result.metrics.toolCalls > 0
            ? result.metrics.errors / result.metrics.toolCalls
            : 0,
          result.metrics.contextOverflows,
          result.healthScore,
          JSON.stringify(result.antiPatterns),
          JSON.stringify(result.recommendations)
        );
      } catch (error) {
        console.error('Analysis failed:', error);
      }
    }, 0);

    return c.json({
      success: true,
      transcriptId,
      eventsReceived: payload.events.length,
    });
  } catch (error) {
    console.error('Ingest error:', error);
    return c.json({ error: 'Failed to store transcript' }, 500);
  }
});

// GET /api/repos - List all repositories
api.get('/repos', async (c) => {
  const repos = db.getRepos();
  return c.json({ repos });
});

// GET /api/repos/:id/transcripts - Get transcripts for a repo
api.get('/repos/:id/transcripts', async (c) => {
  const repoId = c.req.param('id');
  const transcripts = db.getTranscriptsByRepo(repoId);

  return c.json({
    transcripts: transcripts.map(t => ({
      id: t.id,
      sessionId: t.session_id,
      eventCount: JSON.parse(t.events).length,
      createdAt: new Date(t.created_at * 1000).toISOString(),
      analyzed: t.analyzed,
    })),
  });
});

// GET /api/transcripts/:id - Get full transcript
api.get('/transcripts/:id', async (c) => {
  const id = c.req.param('id');
  const transcript = db.getTranscript(id);

  if (!transcript) {
    return c.json({ error: 'Not found' }, 404);
  }

  const analysis = db.getAnalysis(id);

  return c.json({
    transcript: {
      id: transcript.id,
      repoId: transcript.repo_id,
      sessionId: transcript.session_id,
      events: JSON.parse(transcript.events),
      createdAt: new Date(transcript.created_at * 1000).toISOString(),
    },
    analysis: analysis
      ? {
          healthScore: analysis.health_score,
          antiPatterns: JSON.parse(analysis.anti_patterns),
          recommendations: JSON.parse(analysis.recommendations),
          metrics: {
            retries: analysis.retry_count,
            errors: analysis.error_count,
            toolFailureRate: analysis.tool_failure_rate,
            contextOverflows: analysis.context_overflows,
          },
        }
      : null,
  });
});

export default api;
```

### File 4: `src/analyzer.ts`

```typescript
import type { TranscriptEvent, AnalysisResult } from './types';

export function analyzeTranscript(events: TranscriptEvent[]): AnalysisResult {
  // Calculate metrics
  const metrics = {
    totalEvents: events.length,
    toolCalls: events.filter(e => e.type === 'tool_use').length,
    errors: events.filter(e => e.type === 'tool_result' && e.error).length,
    retries: detectRetries(events),
    contextOverflows: detectContextOverflows(events),
    duration: calculateDuration(events),
  };

  // Detect anti-patterns
  const antiPatterns = [];

  if (metrics.retries > 2) {
    antiPatterns.push({
      type: 'retry_loops',
      description: `Detected ${metrics.retries} retry attempts`,
      severity: metrics.retries > 5 ? 'high' : 'medium',
    });
  }

  if (metrics.contextOverflows > 0) {
    antiPatterns.push({
      type: 'context_overflow',
      description: `Detected ${metrics.contextOverflows} context overflow errors`,
      severity: 'high',
    });
  }

  const toolFailureRate =
    metrics.toolCalls > 0 ? metrics.errors / metrics.toolCalls : 0;

  if (toolFailureRate > 0.3) {
    antiPatterns.push({
      type: 'tool_failures',
      description: `Tool failure rate: ${(toolFailureRate * 100).toFixed(1)}%`,
      severity: 'medium',
    });
  }

  // Generate recommendations
  const recommendations = [];

  if (metrics.retries > 2) {
    recommendations.push(
      'Consider adding error handling or validation before tool calls'
    );
  }

  if (metrics.contextOverflows > 0) {
    recommendations.push(
      'Use Grep or Read with limits to avoid large file reads'
    );
  }

  if (toolFailureRate > 0.3) {
    recommendations.push(
      'Review tool usage patterns and check for common error causes'
    );
  }

  // Calculate health score (0-100)
  const healthScore = calculateHealthScore(metrics, antiPatterns);

  return {
    transcriptId: '', // Will be set by caller
    metrics,
    antiPatterns,
    recommendations,
    healthScore,
  };
}

function detectRetries(events: TranscriptEvent[]): number {
  let retries = 0;
  const toolUses = events.filter((e): e is Extract<TranscriptEvent, { type: 'tool_use' }> => e.type === 'tool_use');

  for (let i = 0; i < toolUses.length - 1; i++) {
    const current = toolUses[i];
    const next = toolUses[i + 1];

    // Same tool called twice in a row = likely a retry
    if (current.tool_name === next.tool_name) {
      retries++;
    }
  }

  return retries;
}

function detectContextOverflows(events: TranscriptEvent[]): number {
  return events.filter((e): e is Extract<TranscriptEvent, { type: 'tool_result' }> =>
    e.type === 'tool_result' &&
    e.error !== undefined &&
    (e.error.includes('context') ||
      e.error.includes('token limit') ||
      e.error.includes('too large'))
  ).length;
}

function calculateDuration(events: TranscriptEvent[]): number {
  if (events.length < 2) return 0;

  const first = new Date(events[0].timestamp).getTime();
  const last = new Date(events[events.length - 1].timestamp).getTime();

  return last - first;
}

function calculateHealthScore(
  metrics: AnalysisResult['metrics'],
  antiPatterns: AnalysisResult['antiPatterns']
): number {
  let score = 100;

  // Penalize retries
  score -= metrics.retries * 5;

  // Penalize errors
  score -= metrics.errors * 3;

  // Penalize context overflows
  score -= metrics.contextOverflows * 10;

  // Penalize anti-patterns
  antiPatterns.forEach(ap => {
    if (ap.severity === 'high') score -= 15;
    if (ap.severity === 'medium') score -= 10;
    if (ap.severity === 'low') score -= 5;
  });

  return Math.max(0, Math.min(100, score));
}
```

### File 5: `src/web.tsx`

```typescript
import { Hono } from 'hono';
import { html } from 'hono/html';
import type { TranscriptEvent } from './types';
import * as db from './db';

const web = new Hono();

// Layout component
const Layout = (props: { title: string; children: unknown }) => html`
  <!DOCTYPE html>
  <html>
    <head>
      <title>${props.title}</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-50">
      <div class="min-h-screen">
        <header class="bg-white border-b border-gray-200 px-6 py-4">
          <h1 class="text-xl font-semibold">
            <a href="/">Agentic Engineering Insights</a>
          </h1>
        </header>
        <main class="container mx-auto px-6 py-8">${props.children}</main>
      </div>
    </body>
  </html>
`;

// Home page - List repos
web.get('/', (c) => {
  const repos = db.getRepos();

  return c.html(
    <Layout title="Dashboard">
      <h2 class="text-2xl font-bold mb-6">Repositories</h2>

      {repos.length === 0 ? (
        <p class="text-gray-600">No repositories yet. Start capturing transcripts!</p>
      ) : (
        <div class="bg-white rounded-lg border">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Repository
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Transcripts
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Last Activity
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              {repos.map(repo => (
                <tr>
                  <td class="px-6 py-4">
                    <div class="font-medium">{repo.name}</div>
                    <div class="text-sm text-gray-500">{repo.url}</div>
                  </td>
                  <td class="px-6 py-4 text-sm">{repo.transcript_count}</td>
                  <td class="px-6 py-4 text-sm text-gray-500">{repo.last_activity}</td>
                  <td class="px-6 py-4 text-sm">
                    <a
                      href={`/repos/${repo.id}`}
                      class="text-blue-600 hover:text-blue-800"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
});

// Repo detail page - List transcripts
web.get('/repos/:id', (c) => {
  const repoId = c.req.param('id');
  const transcripts = db.getTranscriptsByRepo(repoId);
  const repo = db.getRepos().find(r => r.id === repoId);

  if (!repo) {
    return c.html(<Layout title="Not Found"><p>Repository not found</p></Layout>);
  }

  return c.html(
    <Layout title={repo.name}>
      <a href="/" class="text-blue-600 hover:text-blue-800 text-sm">
        ← Back to Dashboard
      </a>
      <h2 class="text-2xl font-bold mt-2 mb-6">{repo.name}</h2>

      <div class="bg-white rounded-lg border">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Session
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Events
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            {transcripts.map(t => (
              <tr>
                <td class="px-6 py-4 text-sm font-mono">
                  {t.session_id?.slice(0, 8)}...
                </td>
                <td class="px-6 py-4 text-sm">
                  {JSON.parse(t.events).length}
                </td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  {new Date(t.created_at * 1000).toLocaleString()}
                </td>
                <td class="px-6 py-4 text-sm">
                  <a
                    href={`/transcripts/${t.id}`}
                    class="text-blue-600 hover:text-blue-800"
                  >
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
});

// Transcript detail page
web.get('/transcripts/:id', (c) => {
  const id = c.req.param('id');
  const transcript = db.getTranscript(id);
  const analysis = db.getAnalysis(id);

  if (!transcript) {
    return c.html(<Layout title="Not Found"><p>Transcript not found</p></Layout>);
  }

  const events = JSON.parse(transcript.events);

  return c.html(
    <Layout title="Transcript">
      <a href={`/repos/${transcript.repo_id}`} class="text-blue-600 text-sm">
        ← Back to Repository
      </a>
      <h2 class="text-2xl font-bold mt-2 mb-6">Transcript</h2>

      {analysis && (
        <div class="bg-white rounded-lg border p-6 mb-6">
          <h3 class="font-semibold mb-4">Analysis</h3>
          <div class="grid grid-cols-4 gap-4 mb-4">
            <div>
              <div class="text-sm text-gray-600">Health Score</div>
              <div class="text-2xl font-bold">{analysis.health_score}%</div>
            </div>
            <div>
              <div class="text-sm text-gray-600">Retries</div>
              <div class="text-2xl font-bold">{analysis.retry_count}</div>
            </div>
            <div>
              <div class="text-sm text-gray-600">Errors</div>
              <div class="text-2xl font-bold">{analysis.error_count}</div>
            </div>
            <div>
              <div class="text-sm text-gray-600">Failure Rate</div>
              <div class="text-2xl font-bold">
                {(analysis.tool_failure_rate * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {JSON.parse(analysis.anti_patterns).length > 0 && (
            <div class="mb-4">
              <h4 class="font-medium mb-2">Anti-Patterns</h4>
              <ul class="list-disc list-inside text-sm">
                {(JSON.parse(analysis.anti_patterns) as Array<{ type: string; description: string; severity: string }>).map(ap => (
                  <li>{ap.description}</li>
                ))}
              </ul>
            </div>
          )}

          {JSON.parse(analysis.recommendations).length > 0 && (
            <div>
              <h4 class="font-medium mb-2">Recommendations</h4>
              <ul class="list-disc list-inside text-sm">
                {JSON.parse(analysis.recommendations).map((rec: string) => (
                  <li>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div class="space-y-4">
        {(events as TranscriptEvent[]).map((event, i) => (
          <div
            class={`rounded-lg border p-4 ${
              event.type === 'user'
                ? 'bg-blue-50'
                : event.type === 'assistant'
                ? 'bg-green-50'
                : event.type === 'tool_use'
                ? 'bg-purple-50'
                : event.type === 'tool_result'
                ? (event.error ? 'bg-red-50' : 'bg-gray-50')
                : 'bg-gray-50'
            }`}
          >
            <div class="flex justify-between mb-2">
              <span class="text-sm font-semibold">
                #{i + 1} {event.type}
              </span>
              <span class="text-xs text-gray-500">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {event.type === 'user' && (
              <pre class="text-sm whitespace-pre-wrap bg-white/50 p-3 rounded">
                {event.message.content}
              </pre>
            )}

            {event.type === 'assistant' && (
              <div class="text-sm whitespace-pre-wrap bg-white/50 p-3 rounded">
                {event.message.content.map(c => c.text || '').join('')}
              </div>
            )}

            {event.type === 'tool_use' && (
              <>
                <div class="text-sm font-medium mb-2">Tool: {event.tool_name}</div>
                <pre class="text-xs whitespace-pre-wrap bg-white/50 p-3 rounded overflow-x-auto">
                  {JSON.stringify(event.tool_input, null, 2)}
                </pre>
              </>
            )}

            {event.type === 'tool_result' && (
              <>
                <div class="text-sm font-medium mb-2">Result: {event.tool_name}</div>
                {event.error ? (
                  <div class="text-sm text-red-600 bg-white/50 p-3 rounded">
                    Error: {event.error}
                  </div>
                ) : (
                  <pre class="text-xs whitespace-pre-wrap bg-white/50 p-3 rounded overflow-x-auto">
                    {JSON.stringify(event.tool_response, null, 2)}
                  </pre>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
});

export default web;
```

### File 6: `src/index.ts`

```typescript
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import api from './api';
import web from './web';
import { db } from './db';

const app = new Hono();

// Logging
app.use('*', logger());

// Health check
app.get('/health', (c) => {
  try {
    db.query('SELECT 1').get();
    return c.json({ status: 'ok' });
  } catch (error) {
    return c.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown'
    }, 503);
  }
});

// Mount routes
app.route('/api', api);
app.route('/', web);

// Start server
const port = process.env.PORT || 3000;

export default {
  port,
  fetch: app.fetch,
};

console.log(`Server running on http://localhost:${port}`);
```

### File 7: `package.json`

```json
{
  "name": "@aei/server",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "test": "bun test",
    "reset-db": "rm -f aei.db && bun run src/db.ts"
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
```

## Testing

```typescript
// test/analyzer.test.ts
import { test, expect } from 'bun:test';
import { analyzeTranscript } from '../src/analyzer';
import type { TranscriptEvent } from '../src/types';

test('detects retry loops', () => {
  const events: TranscriptEvent[] = [
    {
      sessionId: 'test-session',
      uuid: 'uuid-1',
      timestamp: '2024-01-01T00:00:00Z',
      type: 'tool_use',
      tool_name: 'Read',
      tool_input: { file_path: 'file.ts' }
    },
    {
      sessionId: 'test-session',
      uuid: 'uuid-2',
      timestamp: '2024-01-01T00:00:01Z',
      type: 'tool_use',
      tool_name: 'Read',
      tool_input: { file_path: 'file.ts' }
    },
  ];

  const result = analyzeTranscript(events);
  expect(result.metrics.retries).toBe(1);
});
```

---

**Time to Implement**: 2 hours
**Next**: Run `pnpm typecheck && bun test && bun scripts/smoke-test.ts`
