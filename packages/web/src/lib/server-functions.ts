import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDrizzle } from "../db";
import * as queries from "../db/queries";
import { teamInvites, teamMembers, teams, transcripts, visibilityOptions, type VisibilityOption } from "../db/schema";
import { createAuth } from "./auth";
import { logger } from "./logger";

/**
 * Get the current authenticated user's ID
 * Throws if not authenticated
 */
async function getAuthenticatedUserId() {
  const auth = createAuth();
  const headers = getRequestHeaders();

  const session = await auth.api.getSession({
    headers,
  });

  if (!session?.user) {
    logger.error("Authentication failed: No session or user found");
    throw new Error("Unauthorized");
  }

  return session.user.id;
}

/**
 * Server function to fetch the current session
 * Returns null if not authenticated
 */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const auth = createAuth();
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    });

    if (!session?.user) {
      return null;
    }

    // Fetch user role from database
    const db = createDrizzle(env.DB);
    let role: string | null = null;
    try {
      role = await queries.getUserRole(db, session.user.id);
    } catch (roleError) {
      logger.error("Failed to fetch user role, defaulting to waitlist", {
        userId: session.user.id,
        error: roleError instanceof Error ? roleError.message : String(roleError),
      });
      // Default to waitlist if role fetch fails - don't break the session
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        role: role ?? "waitlist",
      },
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt,
      },
    };
  } catch (error) {
    logger.error("getSession failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Return null instead of throwing - SSR must not fail for unauthenticated users
    return null;
  }
});

/**
 * Server function to fetch all repositories for the authenticated user
 */
export const getRepos = createServerFn().handler(async () => {
  const db = createDrizzle(env.DB);
  const userId = await getAuthenticatedUserId();
  return queries.getRepos(db, userId);
});

/**
 * Server function to fetch private transcripts grouped by cwd
 */
export const getPrivateTranscriptsByCwd = createServerFn().handler(async () => {
  const db = createDrizzle(env.DB);
  const userId = await getAuthenticatedUserId();
  return queries.getPrivateTranscriptsByCwd(db, userId);
});

/**
 * Server function to fetch transcripts for a specific repository
 */
export const getTranscriptsByRepo = createServerFn()
  .inputValidator((repoId: string) => repoId)
  .handler(async ({ data: repoId }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();
    const transcripts = await queries.getTranscriptsByRepo(db, userId, repoId);

    // Transform to simplified view
    return transcripts.map((t) => ({
      id: t.id,
      repoId: t.repoId,
      transcriptId: t.transcriptId,
      source: t.source,
      preview: t.preview,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messageCount: t.messageCount,
      costUsd: t.costUsd,
      userName: t.userName,
      userImage: t.userImage,
    }));
  });

/**
 * Server function to fetch transcripts for a specific cwd (private transcripts)
 */
export const getTranscriptsByCwd = createServerFn()
  .inputValidator((cwd: string) => cwd)
  .handler(async ({ data: cwd }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();
    const transcripts = await queries.getTranscriptsByCwd(db, userId, cwd);

    // Transform to simplified view
    return transcripts.map((t) => ({
      id: t.id,
      repoId: t.repoId,
      transcriptId: t.transcriptId,
      source: t.source,
      preview: t.preview,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messageCount: t.messageCount,
      costUsd: t.costUsd,
      cwd: t.cwd,
      userName: t.userName,
      userImage: t.userImage,
    }));
  });

/**
 * Server function to fetch a single transcript
 */
export const getTranscript = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();
    const transcript = await queries.getTranscript(db, userId, id);

    if (!transcript) {
      throw new Error("Transcript not found");
    }

    // Fetch unified transcript from R2
    const r2Bucket = env.BUCKET;
    const repo = transcript.repo;

    // Determine R2 key based on whether this is a repo or private transcript
    const r2Key = repo
      ? `${repo.repo}/${transcript.transcriptId}.json`
      : `private/${userId}/${transcript.transcriptId}.json`;
    const r2Object = await r2Bucket.get(r2Key);
    if (!r2Object) {
      logger.error("Unified transcript not found in R2", { key: r2Key });
      throw new Error("Transcript content not found");
    }

    const unifiedJson = await r2Object.text();
    const unifiedTranscript = JSON.parse(unifiedJson);

    // Return transcript with metadata and unified content
    return {
      id: transcript.id,
      repoId: transcript.repoId,
      transcriptId: transcript.transcriptId,
      source: transcript.source,
      preview: transcript.preview,
      createdAt: transcript.createdAt,
      updatedAt: transcript.updatedAt,
      unifiedTranscript,
      userName: transcript.user?.name,
      userImage: transcript.user?.image,
    };
  });

/**
 * Server function to fetch a transcript ID by session/transcript ID.
 */
export const getTranscriptBySessionId = createServerFn({ method: "GET" })
  .inputValidator((sessionId: string) => sessionId)
  .handler(async ({ data: sessionId }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();
    const transcript = await queries.getTranscriptByTranscriptId(db, userId, sessionId);

    if (!transcript) {
      throw new Error("Transcript not found");
    }

    return transcript;
  });

/**
 * Server function to fetch all transcripts for the authenticated user
 */
export const getAllTranscripts = createServerFn().handler(async () => {
  const db = createDrizzle(env.DB);
  const userId = await getAuthenticatedUserId();
  const transcripts = await queries.getAllTranscripts(db, userId);

  return transcripts.map((t) => ({
    id: t.id,
    repoId: t.repoId,
    transcriptId: t.transcriptId,
    source: t.source,
    preview: t.preview,
    summary: t.summary,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messageCount: t.messageCount,
    toolCount: t.toolCount,
    userMessageCount: t.userMessageCount,
    filesChanged: t.filesChanged,
    linesAdded: t.linesAdded,
    linesRemoved: t.linesRemoved,
    costUsd: t.costUsd,
    userName: t.userName,
    userImage: t.userImage,
    repoName: t.repoName,
    branch: t.branch,
    cwd: t.cwd,
  }));
});

// =============================================================================
// Admin Server Functions
// =============================================================================

/**
 * Check if current user is an admin
 */
async function requireAdmin() {
  const auth = createAuth();
  const headers = getRequestHeaders();

  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const db = createDrizzle(env.DB);
  const role = await queries.getUserRole(db, session.user.id);

  if (role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }

  return session.user.id;
}

/**
 * Get admin dashboard stats
 */
export const getAdminStats = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const db = createDrizzle(env.DB);
  return queries.getAdminAggregateStats(db);
});

/**
 * Get all users with their stats (admin only)
 */
export const getAdminUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const db = createDrizzle(env.DB);
  return queries.getAdminUserStats(db);
});

// =============================================================================
// Team Server Functions
// =============================================================================

/**
 * Get user's team with members
 */
export const getTeam = createServerFn({ method: "GET" }).handler(async () => {
  const db = createDrizzle(env.DB);
  const userId = await getAuthenticatedUserId();
  return queries.getUserTeam(db, userId);
});

/**
 * Create a new team (auto-generated name)
 */
export const createTeam = createServerFn({ method: "POST" }).handler(async () => {
  const db = createDrizzle(env.DB);
  const auth = createAuth();
  const headers = getRequestHeaders();

  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;
  const teamName = `${session.user.name}'s Team`;

  // Check if user is already in a team (app-level enforcement)
  const existingMembership = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, userId),
  });
  if (existingMembership) {
    throw new Error("Already in a team. Leave current team first.");
  }

  // Transaction: create team + add owner as member atomically
  const result = await db.transaction(async (tx) => {
    const [newTeam] = await tx
      .insert(teams)
      .values({
        name: teamName,
        ownerId: userId,
      })
      .returning();

    await tx.insert(teamMembers).values({
      teamId: newTeam.id,
      userId: userId,
    });

    return newTeam;
  });

  logger.info("Team created", { teamId: result.id, ownerId: userId });
  return { id: result.id, name: result.name };
});

/**
 * Delete team (owner only)
 * Note: No visibility reset needed - ON DELETE SET NULL handles sharedWithTeamId,
 * and access control checks owner-in-team which will fail.
 */
export const deleteTeam = createServerFn({ method: "POST" })
  .inputValidator((teamId: string) => teamId)
  .handler(async ({ data: teamId }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists and user is owner
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.ownerId !== userId) {
      throw new Error("Only the owner can delete the team");
    }

    // Delete team (CASCADE deletes members/invites, SET NULL on transcripts.sharedWithTeamId)
    await db.delete(teams).where(eq(teams.id, teamId));

    logger.info("Team deleted", { teamId, deletedBy: userId });
    return { success: true };
  });

/**
 * Leave team (non-owner only)
 * Note: No visibility reset needed - access control checks owner-in-team which will fail
 * after leaving. Transcripts with sharedWithTeamId still set become inaccessible.
 */
export const leaveTeam = createServerFn({ method: "POST" })
  .inputValidator((teamId: string) => teamId)
  .handler(async ({ data: teamId }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }

    // Owner cannot leave (must delete team instead)
    if (team.ownerId === userId) {
      throw new Error("Owner cannot leave. Delete the team instead.");
    }

    // Check if user is member
    const isMember = await queries.isTeamMember(db, teamId, userId);
    if (!isMember) {
      throw new Error("Not a member of this team");
    }

    // Just remove membership - no visibility reset needed
    await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

    logger.info("User left team", { teamId, userId });
    return { success: true };
  });

/**
 * Add member by email (owner only)
 */
export const addMemberByEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { teamId: string; email: string }) => input)
  .handler(async ({ data: { teamId, email } }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists and user is owner
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.ownerId !== userId) {
      throw new Error("Only the owner can add members");
    }

    // Find user by email (case-insensitive)
    const targetUser = await queries.findUserByEmail(db, email);
    if (!targetUser) {
      throw new Error("User not found. They must sign up first.");
    }

    // Check if target user is already in a team
    const existingMembership = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.userId, targetUser.id),
    });
    if (existingMembership) {
      throw new Error("User is already in a team");
    }

    // Add member
    await db.insert(teamMembers).values({
      teamId,
      userId: targetUser.id,
    });

    logger.info("Member added to team", { teamId, memberId: targetUser.id, addedBy: userId });
    return { success: true, userId: targetUser.id };
  });

/**
 * Remove member (owner only, cannot remove self)
 */
export const removeMember = createServerFn({ method: "POST" })
  .inputValidator((input: { teamId: string; targetUserId: string }) => input)
  .handler(async ({ data: { teamId, targetUserId } }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists and user is owner
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.ownerId !== userId) {
      throw new Error("Only the owner can remove members");
    }

    // Cannot remove owner
    if (targetUserId === team.ownerId) {
      throw new Error("Cannot remove the owner. Delete the team instead.");
    }

    // Check if target is actually a member
    const isMember = await queries.isTeamMember(db, teamId, targetUserId);
    if (!isMember) {
      throw new Error("User is not a member of this team");
    }

    // Just remove membership - access control handles visibility
    // (owner must still be in sharedWithTeamId team for transcripts to be visible)
    await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)));

    logger.info("Member removed from team", { teamId, memberId: targetUserId, removedBy: userId });
    return { success: true };
  });

/**
 * Generate invite link (owner only)
 */
export const generateInvite = createServerFn({ method: "POST" })
  .inputValidator((teamId: string) => teamId)
  .handler(async ({ data: teamId }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify team exists and user is owner
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });
    if (!team) {
      throw new Error("Team not found");
    }
    if (team.ownerId !== userId) {
      throw new Error("Only the owner can generate invites");
    }

    // Delete existing invite if any
    await db.delete(teamInvites).where(eq(teamInvites.teamId, teamId));

    // Generate new invite (16 chars = ~95 bits entropy)
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(teamInvites).values({
      teamId,
      code,
      expiresAt,
    });

    logger.info("Invite generated", { teamId, code });
    return { code, url: `/join/${code}`, expiresAt };
  });

/**
 * Get invite info (public - used in join page loader)
 */
export const getInviteInfo = createServerFn({ method: "GET" })
  .inputValidator((code: string) => code)
  .handler(async ({ data: code }) => {
    const db = createDrizzle(env.DB);

    const invite = await queries.getInviteByCode(db, code);
    if (!invite) {
      return null;
    }

    const isExpired = new Date(invite.expiresAt) < new Date();

    return {
      code: invite.code,
      teamName: invite.team.name,
      memberCount: invite.team.members.length,
      ownerName: invite.team.owner.name,
      expired: isExpired,
    };
  });

/**
 * Accept invite (authenticated users only)
 */
export const acceptInvite = createServerFn({ method: "POST" })
  .inputValidator((code: string) => code)
  .handler(async ({ data: code }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    const invite = await queries.getInviteByCode(db, code);
    if (!invite) {
      throw new Error("Invite not found or has been revoked");
    }

    if (new Date(invite.expiresAt) < new Date()) {
      throw new Error("This invite has expired. Please ask for a new one.");
    }

    // Check if user is already in a team
    const existingMembership = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.userId, userId),
    });
    if (existingMembership) {
      throw new Error("Already in a team. Leave current team first.");
    }

    // Add user to team
    await db.insert(teamMembers).values({
      teamId: invite.teamId,
      userId,
    });

    logger.info("User joined team via invite", { teamId: invite.teamId, userId, code });
    return { success: true, teamId: invite.teamId };
  });

/**
 * Update transcript visibility
 * When setting to 'team', also stores the specific sharedWithTeamId
 */
export const updateVisibility = createServerFn({ method: "POST" })
  .inputValidator((input: { transcriptId: string; visibility: string }) => input)
  .handler(async ({ data: { transcriptId, visibility } }) => {
    const db = createDrizzle(env.DB);
    const userId = await getAuthenticatedUserId();

    // Verify transcript exists and user owns it
    const transcript = await db.query.transcripts.findFirst({
      where: eq(transcripts.id, transcriptId),
    });
    if (!transcript) {
      throw new Error("Transcript not found");
    }
    if (transcript.userId !== userId) {
      throw new Error("You can only change visibility of your own transcripts");
    }

    // Validate visibility value
    if (!visibility || !visibilityOptions.includes(visibility as VisibilityOption)) {
      throw new Error(`Invalid visibility. Must be one of: ${visibilityOptions.join(", ")}`);
    }

    // Determine sharedWithTeamId based on visibility
    let sharedWithTeamId: string | null = null;
    if (visibility === "team") {
      const userTeam = await queries.getUserTeam(db, userId);
      if (!userTeam) {
        throw new Error("You must be in a team to share with team. Create or join a team first.");
      }
      sharedWithTeamId = userTeam.id;
    }

    // Update visibility AND sharedWithTeamId together
    await db
      .update(transcripts)
      .set({
        visibility: visibility as VisibilityOption,
        sharedWithTeamId, // null for private/public, teamId for team
      })
      .where(eq(transcripts.id, transcriptId));

    logger.info("Transcript visibility updated", { transcriptId, visibility, sharedWithTeamId, userId });
    return { success: true, visibility, sharedWithTeamId };
  });
