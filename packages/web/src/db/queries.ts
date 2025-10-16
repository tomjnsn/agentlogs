import { and, desc, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from ".";
import { analysis, repos, transcripts } from "./schema";

/**
 * Upsert a repository (insert or update if exists)
 */
export async function upsertRepo(db: DrizzleDB, userId: string, id: string, name: string, url: string) {
  await db
    .insert(repos)
    .values({
      id,
      name,
      url,
      userId,
      lastActivity: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: repos.id,
      set: {
        lastActivity: new Date().toISOString(),
      },
    });
}

/**
 * Get all repos for a user with computed transcript count
 */
export async function getRepos(db: DrizzleDB, userId: string) {
  return await db
    .select({
      id: repos.id,
      name: repos.name,
      url: repos.url,
      lastActivity: repos.lastActivity,
      userId: repos.userId,
      createdAt: repos.createdAt,
      transcriptCount: sql<number>`CAST(COUNT(${transcripts.id}) AS INTEGER)`.as("transcript_count"),
    })
    .from(repos)
    .leftJoin(transcripts, eq(transcripts.repoId, repos.id))
    .where(eq(repos.userId, userId))
    .groupBy(repos.id)
    .orderBy(desc(repos.lastActivity));
}

/**
 * Upsert transcript with race-condition-safe logic.
 * Returns the action taken: "inserted", "updated", or "skipped".
 */
export async function upsertTranscript(
  db: DrizzleDB,
  id: string,
  userId: string,
  repoId: string,
  sessionId: string,
  events: string,
): Promise<{ action: "inserted" | "updated" | "skipped"; id: string; oldEventCount?: number }> {
  const insertResult = await db
    .insert(transcripts)
    .values({
      id,
      repoId,
      sessionId,
      events,
      userId,
    })
    .onConflictDoNothing()
    .returning({ id: transcripts.id });

  if (insertResult.length > 0) {
    return { action: "inserted", id: insertResult[0].id };
  }

  const existing = await db.query.transcripts.findFirst({
    where: and(eq(transcripts.sessionId, sessionId), eq(transcripts.userId, userId)),
  });

  if (!existing) {
    // Another request may still be committing; retry once before falling back.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const retry = await db.query.transcripts.findFirst({
      where: and(eq(transcripts.sessionId, sessionId), eq(transcripts.userId, userId)),
    });

    if (!retry) {
      return { action: "inserted", id };
    }

    return { action: "inserted", id: retry.id };
  }

  const existingEvents = JSON.parse(existing.events) as unknown[];
  const existingCount = existingEvents.length;
  const newEventCount = (JSON.parse(events) as unknown[]).length;

  if (newEventCount > existingCount) {
    await db.update(transcripts).set({ events }).where(eq(transcripts.id, existing.id));
    return { action: "updated", id: existing.id, oldEventCount: existingCount };
  }

  return { action: "skipped", id: existing.id, oldEventCount: existingCount };
}

/**
 * Get transcripts for a specific repo
 */
export async function getTranscriptsByRepo(db: DrizzleDB, userId: string, repoId: string) {
  return await db
    .select()
    .from(transcripts)
    .where(and(eq(transcripts.repoId, repoId), eq(transcripts.userId, userId)))
    .orderBy(desc(transcripts.createdAt));
}

/**
 * Get a single transcript with its analysis and repo (using relations)
 */
export async function getTranscript(db: DrizzleDB, userId: string, id: string) {
  return await db.query.transcripts.findFirst({
    where: and(eq(transcripts.id, id), eq(transcripts.userId, userId)),
    with: {
      analysis: true,
      repo: true,
    },
  });
}

/**
 * Get unanalyzed transcripts
 */
export async function getUnanalyzedTranscripts(db: DrizzleDB, limit: number = 100) {
  return await db.select().from(transcripts).where(eq(transcripts.analyzed, false)).limit(limit);
}

/**
 * Insert analysis for a transcript
 */
export async function insertAnalysis(
  db: DrizzleDB,
  transcriptId: string,
  retryCount: number,
  errorCount: number,
  toolFailureRate: number,
  contextOverflows: number,
  healthScore: number,
  antiPatterns: string,
  recommendations: string,
) {
  // Use transaction to ensure atomicity
  await db.batch([
    db.insert(analysis).values({
      transcriptId,
      retryCount,
      errorCount,
      toolFailureRate,
      contextOverflows,
      healthScore,
      antiPatterns,
      recommendations,
    }),
    db.update(transcripts).set({ analyzed: true }).where(eq(transcripts.id, transcriptId)),
  ]);
}

/**
 * Get analysis for a transcript
 */
export async function getAnalysis(db: DrizzleDB, transcriptId: string) {
  return await db.query.analysis.findFirst({
    where: eq(analysis.transcriptId, transcriptId),
  });
}
