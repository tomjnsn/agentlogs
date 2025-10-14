import { existsSync, readFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import type { TranscriptEvent, UploadPayload } from "@vibeinsights/shared";
import { transcriptEventSchema } from "@vibeinsights/shared";
import { getRepoMetadata, uploadTranscript } from "@vibeinsights/shared/upload";
import type { UploadOptions } from "@vibeinsights/shared/upload";

interface ParsedTranscript {
  events: TranscriptEvent[];
  invalidLines: number;
}

export interface PerformUploadParams {
  transcriptPath: string;
  reason: string;
  sessionId?: string;
  cwdOverride?: string;
}

export interface PerformUploadResult {
  success: boolean;
  transcriptId?: string;
  eventCount: number;
  invalidLines: number;
  sessionId: string;
  cwd: string;
}

export async function performUpload(
  params: PerformUploadParams,
  options: UploadOptions = {},
): Promise<PerformUploadResult> {
  const { transcriptPath, reason, sessionId, cwdOverride } = params;

  if (!transcriptPath) {
    throw new Error("No transcript path provided.");
  }

  if (!existsSync(transcriptPath)) {
    throw new Error(`Transcript file not found at path: ${transcriptPath}`);
  }

  const rawContent = readFileSync(transcriptPath, "utf8");
  const { events, invalidLines } = parseTranscript(rawContent);

  if (invalidLines > 0) {
    console.warn(`Skipped ${invalidLines} line(s) that were not valid JSON.`);
  }

  if (events.length === 0) {
    throw new Error("No transcript events found in the specified file.");
  }

  const finalSessionId = sessionId ?? extractSessionId(events);
  if (!finalSessionId) {
    throw new Error("Could not determine sessionId from transcript events.");
  }

  const transcriptCwd = cwdOverride ?? extractCwd(events) ?? process.cwd();
  const repoPath = existsSync(transcriptCwd) ? transcriptCwd : process.cwd();
  const { repoId, repoName } = getRepoMetadata(repoPath);

  const payload: UploadPayload = {
    repoId,
    repoName,
    sessionId: finalSessionId,
    events,
    metadata: {
      cwd: transcriptCwd,
      reason,
      eventCount: events.length,
    },
  };

  const result = await uploadTranscript(payload, options);

  return {
    ...result,
    eventCount: events.length,
    invalidLines,
    sessionId: finalSessionId,
    cwd: transcriptCwd,
  };
}

export function resolveTranscriptPath(inputPath: string): string | null {
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

  const directCandidate = tryResolve(process.cwd()) ?? tryResolve(process.env.INIT_CWD) ?? tryResolve(process.env.PWD);

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
