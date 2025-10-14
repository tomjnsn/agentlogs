import { existsSync, readFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import type { TranscriptEvent, UploadPayload } from "@vibeinsights/shared";
import { transcriptEventSchema } from "@vibeinsights/shared";
import { getRepoMetadata, uploadTranscript } from "@vibeinsights/shared/upload";
import type { UploadOptions } from "@vibeinsights/shared/upload";
import { getToken, readConfig } from "../config";

interface ParsedTranscript {
  events: TranscriptEvent[];
  invalidLines: number;
}

const MANUAL_UPLOAD_REASON = "manual-cli-upload";

export async function uploadCommand(args: string[]): Promise<void> {
  const [transcriptArg] = args;

  if (!transcriptArg) {
    console.error("The upload command expects a <transcript> argument.");
    process.exit(1);
  }

  const transcriptPath = resolveTranscriptPath(transcriptArg);

  if (!transcriptPath) {
    console.error(`Transcript file not found for path: ${transcriptArg}`);
    process.exit(1);
  }

  let rawContent: string;
  try {
    rawContent = readFileSync(transcriptPath, "utf8");
  } catch (error) {
    console.error("Failed to read transcript file:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const { events, invalidLines } = parseTranscript(rawContent);

  if (invalidLines > 0) {
    console.warn(`Skipped ${invalidLines} line(s) that were not valid JSON.`);
  }

  if (events.length === 0) {
    console.error("No transcript events found in the specified file.");
    process.exit(1);
  }

  const sessionId = extractSessionId(events);
  if (!sessionId) {
    console.error("Could not determine sessionId from transcript events.");
    process.exit(1);
  }

  const cwdFromEvents = extractCwd(events);
  const repoPath = cwdFromEvents && existsSync(cwdFromEvents) ? cwdFromEvents : process.cwd();
  const { repoId, repoName } = getRepoMetadata(repoPath);

  const payload: UploadPayload = {
    repoId,
    repoName,
    sessionId,
    events,
    metadata: {
      cwd: cwdFromEvents ?? process.cwd(),
      reason: MANUAL_UPLOAD_REASON,
      eventCount: events.length,
    },
  };

  const config = readConfig();
  const serverUrl =
    process.env.VI_SERVER_URL ??
    process.env.VIBEINSIGHTS_BASE_URL ??
    config.baseURL ??
    "http://localhost:3000";
  const apiToken = process.env.VI_API_TOKEN ?? getToken() ?? undefined;

  const options: UploadOptions = {};
  if (serverUrl) {
    options.serverUrl = serverUrl;
  }
  if (apiToken) {
    options.apiToken = apiToken;
  }

  console.log(`Uploading ${events.length} event(s) from ${transcriptPath} to Vibe Insights...`);
  const result = await uploadTranscript(payload, options);

  if (result.success) {
    console.log(`✓ Upload successful${result.transcriptId ? ` (transcript ID: ${result.transcriptId})` : ""}`);
    return;
  }

  console.error("✗ Failed to upload transcript to Vibe Insights server.");
  process.exit(1);
}

function parseTranscript(content: string): ParsedTranscript {
  const events: TranscriptEvent[] = [];
  let invalidLines = 0;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsedJson = JSON.parse(trimmed) as unknown;
      const validated = transcriptEventSchema.safeParse(parsedJson);

      if (validated.success) {
        events.push(validated.data);
        continue;
      }
    } catch {
      // no-op, increment below
    }

    invalidLines += 1;
  }

  return { events, invalidLines };
}

function extractSessionId(events: TranscriptEvent[]): string | null {
  for (const event of events) {
    if (typeof (event as { sessionId?: unknown }).sessionId === "string") {
      return (event as { sessionId: string }).sessionId;
    }
  }
  return null;
}

function extractCwd(events: TranscriptEvent[]): string | null {
  for (const event of events) {
    if (typeof (event as { cwd?: unknown }).cwd === "string") {
      return (event as { cwd: string }).cwd;
    }
  }
  return null;
}
function resolveTranscriptPath(inputPath: string): string | null {
  if (!inputPath) {
    return null;
  }

  if (isAbsolute(inputPath)) {
    return existsSync(inputPath) ? inputPath : null;
  }

  const checked = new Set<string>();

  const tryResolve = (basePath: string | undefined): string | null => {
    if (!basePath) {
      return null;
    }

    const candidate = resolve(basePath, inputPath);

    if (checked.has(candidate)) {
      return null;
    }

    checked.add(candidate);

    return existsSync(candidate) ? candidate : null;
  };

  const directCandidate =
    tryResolve(process.cwd()) ?? tryResolve(process.env.INIT_CWD) ?? tryResolve(process.env.PWD);

  if (directCandidate) {
    return directCandidate;
  }

  let current = process.cwd();

  while (true) {
    const candidate = tryResolve(current);
    if (candidate) {
      return candidate;
    }

    const parent = dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  return null;
}
