import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DrizzleDB } from ".";
import { repos, transcripts, user } from "./schema";

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
    .select({
      id: transcripts.id,
      repoId: transcripts.repoId,
      userId: transcripts.userId,
      sha256: transcripts.sha256,
      transcriptId: transcripts.transcriptId,
      source: transcripts.source,
      createdAt: transcripts.createdAt,
      preview: transcripts.preview,
      model: transcripts.model,
      costUsd: transcripts.costUsd,
      blendedTokens: transcripts.blendedTokens,
      messageCount: transcripts.messageCount,
      inputTokens: transcripts.inputTokens,
      cachedInputTokens: transcripts.cachedInputTokens,
      outputTokens: transcripts.outputTokens,
      reasoningOutputTokens: transcripts.reasoningOutputTokens,
      totalTokens: transcripts.totalTokens,
      relativeCwd: transcripts.relativeCwd,
      branch: transcripts.branch,
      cwd: transcripts.cwd,
      updatedAt: transcripts.updatedAt,
      userName: user.name,
      userImage: user.image,
    })
    .from(transcripts)
    .leftJoin(user, eq(transcripts.userId, user.id))
    .where(and(eq(transcripts.repoId, repoId), eq(transcripts.userId, userId)))
    .orderBy(desc(transcripts.createdAt));
}

/**
 * Get a single transcript with its repo (using relations)
 */
export async function getTranscript(db: DrizzleDB, userId: string, id: string) {
  return await db.query.transcripts.findFirst({
    where: and(eq(transcripts.id, id), eq(transcripts.userId, userId)),
    with: {
      repo: true,
      user: true,
    },
  });
}

/**
 * Get a transcript by its session/transcript ID for a user.
 */
export async function getTranscriptByTranscriptId(db: DrizzleDB, userId: string, transcriptId: string) {
  return await db.query.transcripts.findFirst({
    columns: {
      id: true,
      transcriptId: true,
    },
    where: and(eq(transcripts.transcriptId, transcriptId), eq(transcripts.userId, userId)),
  });
}

/**
 * Get private transcripts (no repo) grouped by cwd
 */
export async function getPrivateTranscriptsByCwd(db: DrizzleDB, userId: string) {
  const results = await db
    .select({
      cwd: transcripts.cwd,
      transcriptCount: sql<number>`CAST(COUNT(${transcripts.id}) AS INTEGER)`.as("transcript_count"),
    })
    .from(transcripts)
    .where(and(eq(transcripts.userId, userId), isNull(transcripts.repoId)))
    .groupBy(transcripts.cwd)
    .orderBy(desc(sql`MAX(${transcripts.createdAt})`));

  return results;
}

/**
 * Get transcripts for a specific cwd (private transcripts)
 */
export async function getTranscriptsByCwd(db: DrizzleDB, userId: string, cwd: string) {
  return await db
    .select({
      id: transcripts.id,
      repoId: transcripts.repoId,
      userId: transcripts.userId,
      sha256: transcripts.sha256,
      transcriptId: transcripts.transcriptId,
      source: transcripts.source,
      createdAt: transcripts.createdAt,
      preview: transcripts.preview,
      model: transcripts.model,
      costUsd: transcripts.costUsd,
      blendedTokens: transcripts.blendedTokens,
      messageCount: transcripts.messageCount,
      inputTokens: transcripts.inputTokens,
      cachedInputTokens: transcripts.cachedInputTokens,
      outputTokens: transcripts.outputTokens,
      reasoningOutputTokens: transcripts.reasoningOutputTokens,
      totalTokens: transcripts.totalTokens,
      relativeCwd: transcripts.relativeCwd,
      branch: transcripts.branch,
      cwd: transcripts.cwd,
      updatedAt: transcripts.updatedAt,
      userName: user.name,
      userImage: user.image,
    })
    .from(transcripts)
    .leftJoin(user, eq(transcripts.userId, user.id))
    .where(and(eq(transcripts.userId, userId), isNull(transcripts.repoId), eq(transcripts.cwd, cwd)))
    .orderBy(desc(transcripts.createdAt));
}

/**
 * Get all transcripts for a user, sorted chronologically (newest first)
 */
export async function getAllTranscripts(db: DrizzleDB, userId: string) {
  return await db
    .select({
      id: transcripts.id,
      repoId: transcripts.repoId,
      userId: transcripts.userId,
      sha256: transcripts.sha256,
      transcriptId: transcripts.transcriptId,
      source: transcripts.source,
      createdAt: transcripts.createdAt,
      preview: transcripts.preview,
      model: transcripts.model,
      costUsd: transcripts.costUsd,
      blendedTokens: transcripts.blendedTokens,
      messageCount: transcripts.messageCount,
      toolCount: transcripts.toolCount,
      userMessageCount: transcripts.userMessageCount,
      filesChanged: transcripts.filesChanged,
      linesAdded: transcripts.linesAdded,
      linesRemoved: transcripts.linesRemoved,
      inputTokens: transcripts.inputTokens,
      cachedInputTokens: transcripts.cachedInputTokens,
      outputTokens: transcripts.outputTokens,
      reasoningOutputTokens: transcripts.reasoningOutputTokens,
      totalTokens: transcripts.totalTokens,
      relativeCwd: transcripts.relativeCwd,
      branch: transcripts.branch,
      cwd: transcripts.cwd,
      updatedAt: transcripts.updatedAt,
      userName: user.name,
      userImage: user.image,
      repoName: repos.repo,
    })
    .from(transcripts)
    .leftJoin(user, eq(transcripts.userId, user.id))
    .leftJoin(repos, eq(transcripts.repoId, repos.id))
    .where(eq(transcripts.userId, userId))
    .orderBy(desc(transcripts.createdAt));
}
