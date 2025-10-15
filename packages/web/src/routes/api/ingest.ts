import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { uploadPayloadSchema } from "@vibeinsights/shared";
import { env } from "cloudflare:workers";
import { createDrizzle } from "../../db";
import * as queries from "../../db/queries";
import { user } from "../../db/schema";
import { analyzeTranscript } from "../../lib/analyzer";
import { createAuth } from "../../lib/auth";
import { logger } from "../../lib/logger";

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const db = createDrizzle(env.DB);
        const auth = createAuth();

        logger.debug("Ingest request received");

        // Authentication: Check API token or session
        const authHeader = request.headers.get("Authorization");
        let userId: string;

        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.replace("Bearer ", "");
          const expectedToken = env.API_TOKEN || "dev_token";

          if (token === expectedToken) {
            userId = "plugin-user";

            // Ensure plugin user exists in database (idempotent)
            try {
              await db
                .insert(user)
                .values({
                  id: userId,
                  name: "Claude Code Plugin",
                  email: "plugin@vibeinsights.local",
                  emailVerified: true,
                })
                .onConflictDoNothing(); // Ignore if already exists
              logger.debug("Ingest auth: API token validated", { userId });
            } catch (error: unknown) {
              logger.error("Failed to ensure plugin user exists", { error });
              // Continue anyway - user might already exist
            }
          } else {
            // Attempt to authenticate using BetterAuth bearer tokens (e.g. CLI login flow)
            const session = await auth.api.getSession({
              headers: new Headers({
                Authorization: authHeader,
              }),
            });

            if (!session?.user) {
              logger.warn("Ingest auth failed: invalid token");
              return json({ error: "Unauthorized" }, { status: 401 });
            }

            userId = session.user.id;
            logger.debug("Ingest auth: bearer token validated", { userId });
          }
        } else {
          // Session authentication (for web UI)
          const session = await auth.api.getSession({
            headers: request.headers,
          });

          if (!session?.user) {
            logger.warn("Ingest auth failed: no session");
            return json({ error: "Unauthorized" }, { status: 401 });
          }

          userId = session.user.id;
          logger.debug("Ingest auth: session validated", { userId });
        }

        // Parse and validate request body
        const body = (await request.json()) as unknown;
        const result = uploadPayloadSchema.safeParse(body);

        if (!result.success) {
          logger.error("Ingest validation failed", {
            userId,
            errors: result.error.issues,
            receivedKeys: typeof body === "object" && body !== null ? Object.keys(body) : [],
            bodyPreview:
              typeof body === "object" && body !== null
                ? {
                    repoId: (body as Record<string, unknown>).repoId,
                    repoName: (body as Record<string, unknown>).repoName,
                    sessionId: (body as Record<string, unknown>).sessionId,
                    eventsCount: Array.isArray((body as Record<string, unknown>).events)
                      ? ((body as Record<string, unknown>).events as unknown[]).length
                      : "not an array",
                  }
                : {},
          });
          return json({ error: "Invalid request body", details: result.error }, { status: 400 });
        }

        const { repoId, repoName, sessionId, events } = result.data;

        logger.info("Ingest processing", { userId, repoId, repoName, sessionId, eventCount: events.length });

        try {
          // Generate transcript ID
          const transcriptId = crypto.randomUUID();

          // Upsert repository
          await queries.upsertRepo(db, userId, repoId, repoName, repoId);
          logger.debug("Repository upserted", { repoId });

          // Insert transcript
          await queries.insertTranscript(db, userId, transcriptId, repoId, sessionId, JSON.stringify(events));
          logger.debug("Transcript inserted", { transcriptId, eventCount: events.length });

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
              logger.debug("Analysis completed", { transcriptId, healthScore: analysis.healthScore });
            } catch (error: unknown) {
              logger.error("Failed to analyze transcript", { transcriptId, error });
            }
          });

          logger.info("Ingest succeeded", { transcriptId, eventCount: events.length });
          return json({
            success: true,
            transcriptId,
            eventsReceived: events.length,
          });
        } catch (error: unknown) {
          logger.error("Ingest error", { userId, sessionId, error });
          return json({ error: "Failed to ingest transcript" }, { status: 500 });
        }
      },
    },
  },
});
