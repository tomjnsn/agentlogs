import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { uploadPayloadSchema } from '@aei/shared';
import { analyzeTranscript } from './analyzer';
import { createDrizzle } from './lib/drizzle';
import * as queries from './db/queries';
import { authMiddleware, type AuthVariables } from './middleware/auth';
import type { Env } from './types';

const api = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Apply auth middleware to all routes
api.use('*', authMiddleware);

// POST /api/ingest - Receive transcript from plugin
api.post('/ingest', zValidator('json', uploadPayloadSchema), async (c) => {
  const payload = c.req.valid('json');
  const userId = c.get('userId');
  const db = createDrizzle(c.env.DB);

  try {
    // Generate IDs
    const transcriptId = crypto.randomUUID();
    const repoName = payload.repoId.split('/').pop() || 'unknown';

    // Store repo (with userId for multi-tenancy)
    await queries.upsertRepo(db, userId, payload.repoId, repoName, payload.repoId);

    // Store transcript (with userId for multi-tenancy)
    await queries.insertTranscript(
      db,
      userId,
      transcriptId,
      payload.repoId,
      payload.sessionId,
      JSON.stringify(payload.events)
    );

    // Analyze async (using waitUntil to not block response)
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const result = analyzeTranscript(payload.events);
          await queries.insertAnalysis(
            db,
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
      })()
    );

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

// GET /api/repos - List all repositories for the authenticated user
api.get('/repos', async (c) => {
  const userId = c.get('userId');
  const db = createDrizzle(c.env.DB);

  const repos = await queries.getRepos(db, userId);
  return c.json({ repos });
});

// GET /api/repos/:id/transcripts - Get transcripts for a repo (filtered by user)
api.get('/repos/:id/transcripts', async (c) => {
  const userId = c.get('userId');
  const repoId = c.req.param('id');
  const db = createDrizzle(c.env.DB);

  const transcripts = await queries.getTranscriptsByRepo(db, userId, repoId);

  return c.json({
    transcripts: transcripts.map(t => ({
      id: t.id,
      sessionId: t.sessionId,
      eventCount: JSON.parse(t.events).length,
      createdAt: t.createdAt.toISOString(),
      analyzed: t.analyzed,
    })),
  });
});

// GET /api/transcripts/:id - Get full transcript (filtered by user)
api.get('/transcripts/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDrizzle(c.env.DB);

  const result = await queries.getTranscript(db, userId, id);

  if (!result) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({
    transcript: {
      id: result.id,
      repoId: result.repoId,
      sessionId: result.sessionId,
      events: JSON.parse(result.events),
      createdAt: result.createdAt.toISOString(),
    },
    analysis: result.analysis
      ? {
          healthScore: result.analysis.healthScore,
          antiPatterns: JSON.parse(result.analysis.antiPatterns),
          recommendations: JSON.parse(result.analysis.recommendations),
          metrics: {
            retries: result.analysis.retryCount,
            errors: result.analysis.errorCount,
            toolFailureRate: result.analysis.toolFailureRate,
            contextOverflows: result.analysis.contextOverflows,
          },
        }
      : null,
  });
});

export default api;
