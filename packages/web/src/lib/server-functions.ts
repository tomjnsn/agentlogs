import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createDrizzle } from "../db";
import * as queries from "../db/queries";
import { userRoles, type UserRole } from "../db/schema";
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
      summary: transcript.summary,
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

/**
 * Update a user's role (admin only)
 */
export const updateUserRole = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string; role: string }) => {
    if (!data.userId || typeof data.userId !== "string") {
      throw new Error("Invalid userId");
    }
    if (!userRoles.includes(data.role as UserRole)) {
      throw new Error(`Invalid role: ${data.role}`);
    }
    return data as { userId: string; role: UserRole };
  })
  .handler(async ({ data }) => {
    await requireAdmin();
    const db = createDrizzle(env.DB);
    await queries.updateUserRole(db, data.userId, data.role);
    return { success: true };
  });
