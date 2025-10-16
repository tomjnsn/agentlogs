import { and, desc, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from ".";
import { analysis, repos, transcripts } from "./schema";

/**
 * Get all repos for a user with computed transcript count
 */
export async function getRepos(db: DrizzleDB, userId: string) {
  return await db
    .select({
      id: repos.id,
      repo: repos.repo,
      lastActivity: repos.lastActivity,
      createdAt: repos.createdAt,
      transcriptCount: sql<number>`CAST(COUNT(${transcripts.id}) AS INTEGER)`.as("transcript_count"),
    })
    .from(repos)
    .leftJoin(transcripts, and(eq(transcripts.repoId, repos.id), eq(transcripts.userId, userId)))
    .groupBy(repos.id)
    .orderBy(desc(repos.lastActivity));
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
