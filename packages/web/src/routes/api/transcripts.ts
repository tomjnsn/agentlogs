import { createDrizzle } from "@/db";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { repos, transcripts } from "../../db/schema";
import { createAuth } from "../../lib/auth";
import { logger } from "../../lib/logger";

export const Route = createFileRoute("/api/transcripts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const db = createDrizzle(env.DB);
        const auth = createAuth();

        logger.debug("Transcripts metadata request received");

        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session?.user) {
          logger.warn("Transcripts metadata request unauthorized");
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        try {
          const records = await db
            .select({
              transcriptId: transcripts.transcriptId,
              sha256: transcripts.sha256,
              repoId: repos.repo,
            })
            .from(transcripts)
            .innerJoin(repos, eq(transcripts.repoId, repos.id))
            .where(eq(transcripts.userId, userId));

          logger.info("Transcripts metadata fetched", {
            userId,
            transcriptCount: records.length,
          });

          return json({
            transcripts: records,
          });
        } catch (error) {
          logger.error("Failed to fetch transcripts metadata", {
            userId,
            error,
          });
          return json({ error: "Failed to fetch transcripts metadata" }, { status: 500 });
        }
      },
    },
  },
});
