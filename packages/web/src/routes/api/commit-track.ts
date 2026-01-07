import { createDrizzle } from "@/db";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { commitTracking } from "../../db/schema";
import { logger } from "../../lib/logger";

interface CommitTrackPayload {
  session_id?: string;
  repo_path?: string;
  timestamp?: string;
}

export const Route = createFileRoute("/api/commit-track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const db = createDrizzle(env.DB);

        let payload: CommitTrackPayload;
        try {
          payload = (await request.json()) as CommitTrackPayload;
        } catch (error) {
          logger.error("Commit track validation failed: invalid JSON", {
            error: error instanceof Error ? error.message : String(error),
          });
          return json({ error: "Invalid JSON" }, { status: 400 });
        }

        const { session_id, repo_path, timestamp } = payload;

        if (!session_id || !repo_path || !timestamp) {
          logger.error("Commit track validation failed: missing required fields", {
            session_id,
            repo_path,
            timestamp,
          });
          return json({ error: "Missing required fields" }, { status: 400 });
        }

        try {
          await db.insert(commitTracking).values({
            sessionId: session_id,
            repoPath: repo_path,
            timestamp,
          });

          logger.info("Commit track stored", {
            sessionId: session_id.substring(0, 8),
            repoPath: repo_path,
          });

          return json({ success: true });
        } catch (error) {
          logger.error("Commit track insert failed", {
            sessionId: session_id.substring(0, 8),
            repoPath: repo_path,
            error: error instanceof Error ? error.message : String(error),
          });
          return json({ error: "Failed to track commit" }, { status: 500 });
        }
      },
    },
  },
});
