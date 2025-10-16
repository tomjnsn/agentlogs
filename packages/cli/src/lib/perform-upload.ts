import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import type { UploadPayload } from "@vibeinsights/shared";
import { convertClaudeCodeTranscript, type UnifiedTranscript } from "@vibeinsights/shared/claudecode";
import { getRepoMetadata, uploadTranscript } from "@vibeinsights/shared/upload";
import type { UploadOptions } from "@vibeinsights/shared/upload";

export interface PerformUploadParams {
  transcriptPath: string;
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
  unifiedTranscript: UnifiedTranscript;
  sha256: string;
}

export async function performUpload(
  params: PerformUploadParams,
  options: UploadOptions = {},
): Promise<PerformUploadResult> {
  const { transcriptPath, sessionId, cwdOverride } = params;

  if (!transcriptPath) {
    throw new Error("No transcript path provided.");
  }

  if (!existsSync(transcriptPath)) {
    throw new Error(`Transcript file not found at path: ${transcriptPath}`);
  }

  const rawContent = readFileSync(transcriptPath, "utf8");
  const lines = rawContent.split(/\r?\n/);
  const records: Record<string, unknown>[] = [];
  let invalidLines = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    try {
      const parsed = JSON.parse(line) as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        records.push(parsed as Record<string, unknown>);
      } else {
        invalidLines += 1;
      }
    } catch {
      invalidLines += 1;
    }
  }

  if (invalidLines > 0) {
    console.warn(`Skipped ${invalidLines} line(s) that were not valid JSON.`);
  }

  if (records.length === 0) {
    throw new Error("No transcript events found in the specified file.");
  }

  const unifiedTranscript = convertClaudeCodeTranscript(records);
  if (!unifiedTranscript) {
    throw new Error("Unable to convert transcript to unified format.");
  }

  const finalSessionId = sessionId ?? unifiedTranscript.id;
  if (!finalSessionId) {
    throw new Error("Transcript did not include a session identifier.");
  }

  if (sessionId && sessionId !== unifiedTranscript.id) {
    throw new Error(
      `Provided sessionId (${sessionId}) does not match unified transcript id (${unifiedTranscript.id}).`,
    );
  }

  const transcriptCwd = cwdOverride ?? process.cwd();
  const repoPath = existsSync(transcriptCwd) ? transcriptCwd : process.cwd();
  const { repoId } = getRepoMetadata(repoPath);
  const eventCount = records.length;
  const sha256 = createHash("sha256").update(rawContent).digest("hex");

  const payload: UploadPayload = {
    repoId,
    transcriptId: finalSessionId,
    sha256,
    rawTranscript: rawContent,
  };

  const result = await uploadTranscript(payload, options);

  return {
    ...result,
    eventCount,
    invalidLines,
    sessionId: finalSessionId,
    cwd: transcriptCwd,
    unifiedTranscript,
    sha256,
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
