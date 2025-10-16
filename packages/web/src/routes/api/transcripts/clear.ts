import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDrizzle } from "../../../db";
import { transcripts } from "../../../db/schema";
import { createAuth } from "../../../lib/auth";
import { logger } from "../../../lib/logger";

export const Route = createFileRoute("/api/transcripts/clear")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const db = createDrizzle(env.DB);
        const auth = createAuth();

        logger.debug("Clear transcripts request received");

        // Check authentication
        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session?.user) {
          logger.warn("Clear transcripts auth failed: no session");
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        try {
          // Delete all transcripts for this user
          // Note: Repos remain but transcriptCount is now computed dynamically
          const deletedTranscripts = await db.delete(transcripts).where(eq(transcripts.userId, userId)).returning();

          logger.info("Cleared all transcripts", {
            userId,
            transcriptCount: deletedTranscripts.length,
          });

          return json({
            success: true,
            deletedCount: deletedTranscripts.length,
          });
        } catch (error: unknown) {
          logger.error("Failed to clear transcripts", { userId, error });
          return json({ error: "Failed to clear transcripts" }, { status: 500 });
        }
      },
    },
  },
});
