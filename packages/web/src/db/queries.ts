import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { DrizzleDB } from ".";
import { repos, teamInvites, teamMembers, teams, transcripts, user, type UserRole } from "./schema";

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
      summary: transcripts.summary,
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

/**
 * Get user by ID with role
 */
export async function getUserById(db: DrizzleDB, userId: string) {
  return await db.query.user.findFirst({
    where: eq(user.id, userId),
  });
}

/**
 * Get user role by ID
 */
export async function getUserRole(db: DrizzleDB, userId: string): Promise<UserRole | null> {
  const result = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
  return (result[0]?.role as UserRole) ?? null;
}

// =============================================================================
// Admin Queries
// =============================================================================

/**
 * Get all users with their transcript counts (admin only)
 */
export async function getAdminUserStats(db: DrizzleDB) {
  return await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      createdAt: user.createdAt,
      transcriptCount: sql<number>`CAST(COUNT(${transcripts.id}) AS INTEGER)`.as("transcript_count"),
      totalCost: sql<number>`COALESCE(SUM(${transcripts.costUsd}), 0)`.as("total_cost"),
    })
    .from(user)
    .leftJoin(transcripts, eq(transcripts.userId, user.id))
    .groupBy(user.id)
    .orderBy(desc(user.createdAt));
}

/**
 * Get aggregate stats for the admin dashboard
 */
export async function getAdminAggregateStats(db: DrizzleDB) {
  const [userStats] = await db
    .select({
      totalUsers: count(user.id),
      waitlistUsers: sql<number>`CAST(SUM(CASE WHEN ${user.role} = 'waitlist' THEN 1 ELSE 0 END) AS INTEGER)`,
      activeUsers: sql<number>`CAST(SUM(CASE WHEN ${user.role} = 'user' THEN 1 ELSE 0 END) AS INTEGER)`,
      adminUsers: sql<number>`CAST(SUM(CASE WHEN ${user.role} = 'admin' THEN 1 ELSE 0 END) AS INTEGER)`,
    })
    .from(user);

  const [transcriptStats] = await db
    .select({
      totalTranscripts: count(transcripts.id),
      totalCost: sql<number>`COALESCE(SUM(${transcripts.costUsd}), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(${transcripts.totalTokens}), 0)`,
      totalMessages: sql<number>`COALESCE(SUM(${transcripts.messageCount}), 0)`,
    })
    .from(transcripts);

  const [repoStats] = await db.select({ totalRepos: count(repos.id) }).from(repos);

  return {
    ...userStats,
    ...transcriptStats,
    ...repoStats,
  };
}

// =============================================================================
// Team Queries
// =============================================================================

/**
 * Get user's current team (0 or 1)
 * Returns null if user is not in any team
 */
export async function getUserTeam(db: DrizzleDB, userId: string) {
  const membership = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, userId),
    with: {
      team: {
        with: {
          owner: true,
          members: { with: { user: true } },
        },
      },
    },
  });
  return membership?.team ?? null;
}

/**
 * Get team by ID with members
 */
export async function getTeamWithMembers(db: DrizzleDB, teamId: string) {
  return db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: {
      owner: true,
      members: { with: { user: true } },
      invites: true,
    },
  });
}

/**
 * Check if user is team owner
 */
export async function isTeamOwner(db: DrizzleDB, teamId: string, userId: string) {
  const team = await db.query.teams.findFirst({
    where: and(eq(teams.id, teamId), eq(teams.ownerId, userId)),
  });
  return !!team;
}

/**
 * Check if user is team member
 */
export async function isTeamMember(db: DrizzleDB, teamId: string, userId: string) {
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
  });
  return !!member;
}

/**
 * Find user by email (case-insensitive)
 */
export async function findUserByEmail(db: DrizzleDB, email: string) {
  const result = await db
    .select()
    .from(user)
    .where(sql`LOWER(${user.email}) = LOWER(${email})`)
    .limit(1);
  return result[0] ?? null;
}

/**
 * Get invite by code
 */
export async function getInviteByCode(db: DrizzleDB, code: string) {
  return db.query.teamInvites.findFirst({
    where: eq(teamInvites.code, code),
    with: {
      team: {
        with: {
          owner: true,
          members: true,
        },
      },
    },
  });
}
