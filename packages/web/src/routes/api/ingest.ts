import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { uploadPayloadSchema } from "@vibeinsights/shared";
import { env } from "cloudflare:workers";
import { createDrizzle } from "../../db";
import * as queries from "../../db/queries";
import { analyzeTranscript } from "../../lib/analyzer";
import { createAuth } from "../../lib/auth";

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const db = createDrizzle(env.DB);
        const auth = createAuth();

        // Authentication: Check API token or session
        const authHeader = request.headers.get("Authorization");
        let userId: string;

        if (authHeader?.startsWith("Bearer ")) {
          // API token authentication (for Claude Code plugin)
          const token = authHeader.replace("Bearer ", "");
          const expectedToken = env.API_TOKEN || "dev_token";

          if (token !== expectedToken) {
            return json({ error: "Unauthorized" }, { status: 401 });
          }

          // Use plugin user ID
          userId = "plugin-user";
        } else {
          // Session authentication (for web UI)
          const session = await auth.api.getSession({
            headers: request.headers,
          });

          if (!session?.user) {
            return json({ error: "Unauthorized" }, { status: 401 });
          }

          userId = session.user.id;
        }

        // Parse and validate request body
        const body = await request.json();
        const result = uploadPayloadSchema.safeParse(body);

        if (!result.success) {
          return json({ error: "Invalid request body", details: result.error }, { status: 400 });
        }

        const { repo, sessionId, events } = result.data;

        try {
          // Generate transcript ID
          const transcriptId = crypto.randomUUID();

          // Upsert repository
          await queries.upsertRepo(db, userId, repo.id, repo.name, repo.url);

          // Insert transcript
          await queries.insertTranscript(db, userId, transcriptId, repo.id, sessionId, JSON.stringify(events));

          // Analyze transcript asynchronously (don't block response)
          // Note: In TanStack Start, we can use setImmediate or a background job queue
          setImmediate(async () => {
            try {
              const analysis = analyzeTranscript(events);
              await queries.insertAnalysis(
                db,
                transcriptId,
                analysis.metrics.retries,
                analysis.metrics.errors,
                analysis.metrics.toolCalls > 0 ? analysis.metrics.errors / analysis.metrics.toolCalls : 0,
                analysis.metrics.contextOverflows,
                analysis.healthScore,
                JSON.stringify(analysis.antiPatterns),
                JSON.stringify(analysis.recommendations),
              );
            } catch (error) {
              console.error("Failed to analyze transcript:", error);
            }
          });

          return json({
            success: true,
            transcriptId,
            eventsReceived: events.length,
          });
        } catch (error) {
          console.error("Ingest error:", error);
          return json({ error: "Failed to ingest transcript" }, { status: 500 });
        }
      },
    },
  },
});
