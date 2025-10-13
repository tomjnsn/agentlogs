import { and, desc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { analysis, repos, transcripts } from "./schema";
import * as schema from "./schema";

export type DrizzleDB = BetterSQLite3Database<typeof schema>;

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
      transcriptCount: 0,
    })
    .onConflictDoUpdate({
      target: repos.id,
      set: {
        lastActivity: new Date().toISOString(),
        transcriptCount: sql`${repos.transcriptCount} + 1`,
      },
    });
}

/**
 * Get all repos for a user
 */
export async function getRepos(db: DrizzleDB, userId: string) {
  return await db.select().from(repos).where(eq(repos.userId, userId)).orderBy(desc(repos.lastActivity));
}

/**
 * Insert a new transcript
 */
export async function insertTranscript(
  db: DrizzleDB,
  userId: string,
  id: string,
  repoId: string,
  sessionId: string,
  events: string,
) {
  await db.insert(transcripts).values({
    id,
    repoId,
    sessionId,
    events,
    userId,
  });
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
