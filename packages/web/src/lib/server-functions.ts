import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createDrizzle } from "../db";
import * as queries from "../db/queries";
import { createAuth } from "./auth";

/**
 * Get the current authenticated user's ID
 * Throws if not authenticated
 */
async function getAuthenticatedUserId() {
  const auth = createAuth();
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session.user.id;
}

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

    // Transform to simplified view (exclude full events)
    return transcripts.map((t) => ({
      id: t.id,
      repoId: t.repoId,
      sessionId: t.sessionId,
      createdAt: t.createdAt,
      analyzed: t.analyzed,
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

    // Parse JSON fields
    return {
      ...transcript,
      events: JSON.parse(transcript.events),
      analysis: transcript.analysis
        ? {
            ...transcript.analysis,
            antiPatterns: JSON.parse(transcript.analysis.antiPatterns),
            recommendations: JSON.parse(transcript.analysis.recommendations),
          }
        : null,
    };
  });
