import { createDrizzle } from "@/db";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import * as queries from "../../../db/queries";
import { transcripts } from "../../../db/schema";
import { createAuth } from "../../../lib/auth";
import { logger } from "../../../lib/logger";
import { storage } from "../../../lib/storage";

async function requireAdmin(request: Request): Promise<string | Response> {
  const auth = createAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDrizzle();
  const role = await queries.getUserRole(db, session.user.id);

  if (role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return session.user.id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute("/api/admin/transcript-unified/$id" as any)({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const { id } = params;

        // Verify admin status
        const adminResult = await requireAdmin(request);
        if (adminResult instanceof Response) {
          return adminResult;
        }

        const db = createDrizzle();

        // Get transcript from database to find storage path
        const transcript = await db.query.transcripts.findFirst({
          where: eq(transcripts.id, id),
          with: {
            repo: {
              columns: { repo: true },
            },
          },
        });

        if (!transcript) {
          logger.warn("Admin transcript download: not found", { id });
          return new Response(JSON.stringify({ error: "Transcript not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Construct storage key based on whether it's a repo or private transcript
        const repoName = transcript.repo?.repo;
        const storageKey = repoName
          ? `${repoName}/${transcript.transcriptId}.json`
          : `private/${transcript.userId}/${transcript.transcriptId}.json`;

        const storageObject = await storage.get(storageKey);
        if (!storageObject) {
          logger.error("Admin transcript download: storage object not found", { id, storageKey });
          return new Response(JSON.stringify({ error: "Transcript content not found in storage" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        logger.info("Admin downloaded unified transcript", {
          adminId: adminResult,
          transcriptId: id,
          transcriptUuid: transcript.transcriptId,
        });

        const content = await storageObject.text();

        return new Response(content, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
