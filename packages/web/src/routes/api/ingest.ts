import { createDrizzle } from "@/db";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { convertClaudeCodeTranscript } from "@vibeinsights/shared/claudecode";
import { LiteLLMPricingFetcher } from "@vibeinsights/shared/pricing";
import { unifiedTranscriptSchema } from "@vibeinsights/shared/schemas";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { analysis, repos, transcripts } from "../../db/schema";
import { analyzeTranscript } from "../../lib/analyzer";
import { createAuth } from "../../lib/auth";
import { logger } from "../../lib/logger";

// Global pricing fetcher instance to cache pricing data across requests
let globalPricingFetcher: LiteLLMPricingFetcher | null = null;

function getPricingFetcher(): LiteLLMPricingFetcher {
  if (!globalPricingFetcher) {
    globalPricingFetcher = new LiteLLMPricingFetcher({
      logger: {
        debug: (...args: unknown[]) => logger.debug("PricingFetcher", ...args),
        info: (...args: unknown[]) => logger.info("PricingFetcher", ...args),
        warn: (...args: unknown[]) => logger.warn("PricingFetcher", ...args),
        error: (...args: unknown[]) => logger.error("PricingFetcher", ...args),
      },
    });
  }
  return globalPricingFetcher;
}

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const db = createDrizzle(env.DB);
        const auth = createAuth();

        logger.debug("Ingest request received");

        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session?.user) {
          logger.warn("Ingest auth failed: no session");
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        let userId = session.user.id;

        // Parse multipart form data (raw transcript upload)
        const formData = await request.formData();
        const repoId = formData.get("repoId");
        const transcriptIdField = formData.get("transcriptId");
        const sha256 = formData.get("sha256");
        const transcriptPart = formData.get("transcript");

        if (
          typeof repoId !== "string" ||
          typeof transcriptIdField !== "string" ||
          typeof sha256 !== "string" ||
          !transcriptPart
        ) {
          logger.error("Ingest validation failed: missing required form fields", {
            userId,
            receivedKeys: Array.from(formData.keys()),
          });
          return json({ error: "Invalid form data" }, { status: 400 });
        }

        const transcriptContent =
          typeof transcriptPart === "string" ? transcriptPart : await (transcriptPart as File).text();

        const computedHash = await sha256Hex(transcriptContent);
        if (computedHash !== sha256) {
          logger.warn("Ingest hash mismatch", {
            userId,
            expected: sha256,
            actual: computedHash,
          });
          return json({ error: "Transcript hash mismatch" }, { status: 400 });
        }

        const rawRecords = parseJsonlRecords(transcriptContent);

        // Fetch pricing data for cost calculation
        const pricingFetcher = getPricingFetcher();
        const pricingData = await pricingFetcher.fetchModelPricing();
        const pricing = Object.fromEntries(pricingData);

        const unifiedTranscript = convertClaudeCodeTranscript(rawRecords, {
          pricing,
        });
        if (!unifiedTranscript) {
          logger.error("Ingest conversion failed: unified transcript could not be generated", {
            userId,
            repoId,
          });
          return json({ error: "Failed to convert transcript" }, { status: 422 });
        }

        if (unifiedTranscript.id !== transcriptIdField) {
          logger.warn("Ingest transcript ID mismatch", {
            userId,
            repoId,
            provided: transcriptIdField,
            derived: unifiedTranscript.id,
          });
          return json({ error: "Transcript ID mismatch" }, { status: 400 });
        }

        logger.debug("Ingest unified transcript payload", {
          userId,
          repoId,
          transcriptId: unifiedTranscript.id,
          unifiedTranscript,
        });

        const eventCount = rawRecords.length;
        const repoName = deriveRepoName(repoId);

        logger.debug("Ingest raw transcript parsed", {
          userId,
          repoId,
          sample: rawRecords.slice(0, 3),
        });

        logger.info("Ingest unified transcript generated", {
          userId,
          repoId,
          transcriptId: unifiedTranscript.id,
          preview: unifiedTranscript.preview,
          messageCount: unifiedTranscript.messageCount,
        });

        // Check if transcript already exists with same sha256
        const existingTranscript = await db.query.repos.findFirst({
          where: eq(repos.repo, repoId),
          with: {
            transcripts: {
              where: and(eq(transcripts.transcriptId, transcriptIdField), eq(transcripts.userId, userId)),
            },
          },
        });

        // If transcript exists and SHA-256 matches, return OK
        if (existingTranscript?.transcripts?.[0] && existingTranscript.transcripts[0].sha256 === sha256) {
          logger.info("Ingest skipped: transcript exists with same sha256", {
            userId,
            repoId,
            transcriptId: transcriptIdField,
            sha256,
          });
          return json({
            success: true,
            transcriptId: transcriptIdField,
            eventsReceived: eventCount,
            sha256,
            status: "unchanged",
          });
        }

        logger.info("Ingest processing", {
          userId,
          repoId,
          repoName,
          transcriptId: transcriptIdField,
          eventCount,
          sha256,
        });

        // Create or get repo record
        const repoRecord = await db
          .insert(repos)
          .values({
            repo: repoId,
            lastActivity: new Date().toISOString(),
          })
          .onConflictDoUpdate({
            target: repos.repo,
            set: {
              lastActivity: new Date().toISOString(),
            },
          })
          .returning({ id: repos.id });

        const repoDbId = repoRecord[0].id;

        // Validate unified transcript with Zod before storing
        const validatedTranscript = unifiedTranscriptSchema.parse(unifiedTranscript);

        // Compute metadata from unified transcript
        const metadata = {
          preview: validatedTranscript.preview,
          model: validatedTranscript.model,
          costUsd: validatedTranscript.costUsd,
          blendedTokens: validatedTranscript.blendedTokens,
          messageCount: validatedTranscript.messageCount,
          inputTokens: validatedTranscript.tokenUsage.inputTokens,
          cachedInputTokens: validatedTranscript.tokenUsage.cachedInputTokens,
          outputTokens: validatedTranscript.tokenUsage.outputTokens,
          reasoningOutputTokens: validatedTranscript.tokenUsage.reasoningOutputTokens,
          totalTokens: validatedTranscript.tokenUsage.totalTokens,
          relativeCwd: validatedTranscript.git?.relativeCwd ?? null,
          branch: validatedTranscript.git?.branch ?? null,
          createdAt: validatedTranscript.timestamp,
        };

        // Insert or update transcript
        const transcriptRecord = await db
          .insert(transcripts)
          .values({
            repoId: repoDbId,
            userId,
            sha256,
            transcriptId: transcriptIdField,
            source: validatedTranscript.source,
            ...metadata,
          })
          .onConflictDoUpdate({
            target: [transcripts.repoId, transcripts.transcriptId],
            set: {
              sha256,
              ...metadata,
            },
          })
          .returning({ id: transcripts.id });

        const transcriptDbId = transcriptRecord[0].id;

        // Analyze transcript
        const analysisResult = analyzeTranscript(unifiedTranscript);
        logger.debug("Ingest analysis complete", {
          transcriptId: transcriptIdField,
          metrics: analysisResult.metrics,
          healthScore: analysisResult.healthScore,
          antiPatterns: analysisResult.antiPatterns,
          recommendations: analysisResult.recommendations,
        });

        // Insert or update analysis
        await db
          .insert(analysis)
          .values({
            transcriptId: transcriptDbId,
            retryCount: analysisResult.metrics.retries,
            errorCount: analysisResult.metrics.errors,
            toolFailureRate:
              analysisResult.metrics.toolCalls > 0
                ? analysisResult.metrics.errors / analysisResult.metrics.toolCalls
                : 0,
            contextOverflows: analysisResult.metrics.contextOverflows,
            healthScore: analysisResult.healthScore,
            antiPatterns: JSON.stringify(analysisResult.antiPatterns),
            recommendations: JSON.stringify(analysisResult.recommendations),
          })
          .onConflictDoUpdate({
            target: analysis.transcriptId,
            set: {
              retryCount: analysisResult.metrics.retries,
              errorCount: analysisResult.metrics.errors,
              toolFailureRate:
                analysisResult.metrics.toolCalls > 0
                  ? analysisResult.metrics.errors / analysisResult.metrics.toolCalls
                  : 0,
              contextOverflows: analysisResult.metrics.contextOverflows,
              healthScore: analysisResult.healthScore,
              antiPatterns: JSON.stringify(analysisResult.antiPatterns),
              recommendations: JSON.stringify(analysisResult.recommendations),
            },
          });

        // Mark transcript as analyzed
        await db.update(transcripts).set({ analyzed: true }).where(eq(transcripts.id, transcriptDbId));

        // Upload to R2
        const r2Bucket = env.BUCKET;
        const r2KeyPrefix = `${repoId}/${transcriptIdField}`;

        // Upload unified transcript as JSON
        const unifiedJson = JSON.stringify(unifiedTranscript);
        await r2Bucket.put(`${r2KeyPrefix}.json`, unifiedJson, {
          httpMetadata: {
            contentType: "application/json",
          },
        });
        logger.debug("Uploaded unified transcript to R2", {
          key: `${r2KeyPrefix}.json`,
          size: unifiedJson.length,
        });

        // Upload gzipped raw transcript
        const gzippedRaw = await gzipString(transcriptContent);
        await r2Bucket.put(`${r2KeyPrefix}.raw.jsonl.gz`, gzippedRaw, {
          httpMetadata: {
            contentType: "application/x-gzip",
          },
        });
        logger.debug("Uploaded raw transcript to R2", {
          key: `${r2KeyPrefix}.raw.jsonl.gz`,
          originalSize: transcriptContent.length,
          compressedSize: gzippedRaw.byteLength,
        });

        return json({
          success: true,
          transcriptId: transcriptIdField,
          eventsReceived: eventCount,
          sha256,
          status: existingTranscript ? "updated" : "created",
        });
      },
    },
  },
});

function parseJsonlRecords(content: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];

  content.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    try {
      const value = JSON.parse(line) as unknown;
      if (typeof value === "object" && value !== null) {
        records.push(value as Record<string, unknown>);
        return;
      }
      throw new Error("Parsed value is not an object");
    } catch (error: unknown) {
      logger.warn("Skipping invalid JSONL line", {
        line: index + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return records;
}

function deriveRepoName(repoId: string): string {
  try {
    const url = new URL(repoId);
    const pathname = url.pathname.replace(/\.git$/, "");
    const segments = pathname.split("/").filter(Boolean);
    return segments.slice(-1)[0] ?? repoId;
  } catch {
    return repoId.split("/").filter(Boolean).slice(-1)[0] ?? repoId;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gzipString(input: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // Use CompressionStream API available in Cloudflare Workers
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  const chunks: Uint8Array[] = [];
  const reader = compressedStream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine all chunks into a single Uint8Array
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
