import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createDrizzle } from "../db";
import * as queries from "../db/queries";
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

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
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
    // Re-throw to let the caller handle it
    throw error;
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
      preview: t.preview,
      createdAt: t.createdAt,
      analyzed: t.analyzed,
      messageCount: t.messageCount,
      costUsd: t.costUsd,
    }));
  });

/**
 * Server function to fetch a single transcript with analysis
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
    if (!repo) {
      throw new Error("Transcript repo not found");
    }

    const r2Key = `${repo.repo}/${transcript.transcriptId}.json`;
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
      preview: transcript.preview,
      createdAt: transcript.createdAt,
      analyzed: transcript.analyzed,
      unifiedTranscript,
      analysis: transcript.analysis
        ? {
            ...transcript.analysis,
            antiPatterns: JSON.parse(transcript.analysis.antiPatterns),
            recommendations: JSON.parse(transcript.analysis.recommendations),
          }
        : null,
    };
  });
