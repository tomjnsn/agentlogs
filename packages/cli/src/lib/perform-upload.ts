import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import type { TranscriptSource, TranscriptVisibility, UploadBlob, UploadPayload } from "@agentlogs/shared";
import { convertClaudeCodeTranscript, resolveGitContext, type UnifiedTranscript } from "@agentlogs/shared/claudecode";
import { convertCodexTranscript } from "@agentlogs/shared/codex";
import { redactSecretsDeep, redactSecretsPreserveLength } from "@agentlogs/shared/redact";
import { LiteLLMPricingFetcher } from "@agentlogs/shared/pricing";
import { uploadTranscript } from "@agentlogs/shared/upload";
import type { UploadOptions } from "@agentlogs/shared/upload";
import { getAuthenticatedEnvironments, type EnvName } from "../config";
import { cacheTranscriptId, getOrCreateTranscriptId } from "../local-store";

export interface PerformUploadParams {
  transcriptPath: string;
  sessionId?: string;
  cwdOverride?: string;
  source?: TranscriptSource;
  /** Visibility override - if not set, server decides based on repo visibility */
  visibility?: TranscriptVisibility;
}

export interface PerformUploadResult {
  success: boolean;
  /** The database ID (CUID2) for stable links */
  id?: string;
  transcriptId?: string;
  eventCount: number;
  invalidLines: number;
  sessionId: string;
  cwd: string;
  unifiedTranscript: UnifiedTranscript;
  sha256: string;
  source: TranscriptSource;
}

export async function performUpload(
  params: PerformUploadParams,
  options: UploadOptions = {},
): Promise<PerformUploadResult> {
  const { transcriptPath, sessionId, source = "claude-code" } = params;

  if (!transcriptPath) {
    throw new Error("No transcript path provided.");
  }

  if (!existsSync(transcriptPath)) {
    throw new Error(`Transcript file not found at path: ${transcriptPath}`);
  }

  const rawContent = readFileSync(transcriptPath, "utf8");
  const redactedRawContent = redactSecretsPreserveLength(rawContent);
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

  const pricingFetcher = new LiteLLMPricingFetcher();
  const pricingData = await pricingFetcher.fetchModelPricing();
  const pricing = Object.fromEntries(pricingData);

  const converterOptions = {
    pricing,
  };

  const resolvedCwd =
    params.cwdOverride && params.cwdOverride.trim().length > 0
      ? params.cwdOverride.trim()
      : (extractCwdFromRecords(records) ?? process.cwd());

  // Resolve git context from .git/config for accurate repo detection
  const gitBranch = extractGitBranchFromRecords(records);
  const gitContext = await resolveGitContext(resolvedCwd, gitBranch);

  const converterOptionsWithGit = {
    ...converterOptions,
    gitContext,
  };

  const conversionResult =
    source === "codex"
      ? convertCodexTranscript(records, converterOptions)
      : convertClaudeCodeTranscript(records, converterOptionsWithGit);

  if (!conversionResult) {
    throw new Error(`Unable to convert ${source} transcript to unified format.`);
  }

  const { transcript, blobs: transcriptBlobs } = conversionResult;

  // Redact secrets from transcript messages
  const unifiedTranscript = redactSecretsDeep(transcript);

  const finalSessionId = sessionId ?? unifiedTranscript.id;
  if (!finalSessionId) {
    throw new Error("Transcript did not include a session identifier.");
  }

  if (sessionId && sessionId !== unifiedTranscript.id) {
    throw new Error(
      `Provided sessionId (${sessionId}) does not match unified transcript id (${unifiedTranscript.id}).`,
    );
  }

  const eventCount = records.length;
  const sha256 = createHash("sha256").update(redactedRawContent).digest("hex");

  // Generate stable client ID for this transcript
  const clientId = await getOrCreateTranscriptId(finalSessionId);

  // Convert Map<sha256, TranscriptBlob> to UploadBlob[]
  const uploadBlobs: UploadBlob[] = [];
  for (const [blobSha256, blob] of transcriptBlobs) {
    uploadBlobs.push({
      sha256: blobSha256,
      data: new Uint8Array(blob.data),
      mediaType: blob.mediaType,
    });
  }

  const payload: UploadPayload = {
    id: clientId,
    sha256,
    rawTranscript: redactedRawContent,
    unifiedTranscript,
    blobs: uploadBlobs.length > 0 ? uploadBlobs : undefined,
    visibility: params.visibility,
  };

  const result = await uploadTranscript(payload, options);

  // Cache the server's returned ID (handles case where server returns existing ID)
  if (result.success && result.id) {
    await cacheTranscriptId(finalSessionId, result.id);
  }

  return {
    ...result,
    eventCount,
    invalidLines,
    sessionId: finalSessionId,
    unifiedTranscript,
    sha256,
    source,
    cwd: resolvedCwd,
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

function extractCwdFromRecords(records: Record<string, unknown>[]): string | null {
  for (const record of records) {
    const cwd = typeof record.cwd === "string" ? record.cwd.trim() : "";
    if (cwd) {
      return cwd;
    }
  }
  return null;
}

function extractGitBranchFromRecords(records: Record<string, unknown>[]): string | undefined {
  for (const record of records) {
    const gitBranch = typeof record.gitBranch === "string" ? record.gitBranch.trim() : "";
    if (gitBranch) {
      return gitBranch;
    }
  }
  return undefined;
}

export interface EnvUploadResult {
  envName: EnvName;
  baseURL: string;
  success: boolean;
  /** The database ID (CUID2) for stable links */
  id?: string;
  transcriptId?: string;
  error?: string;
}

export interface MultiEnvUploadResult {
  results: EnvUploadResult[];
  eventCount: number;
  /** The database ID (CUID2) for stable links */
  id: string;
  sessionId: string;
  anySuccess: boolean;
  allSuccess: boolean;
}

/**
 * Upload a transcript to all authenticated environments.
 * Each environment is uploaded independently - failures in one don't affect others.
 */
export async function performUploadToAllEnvs(params: PerformUploadParams): Promise<MultiEnvUploadResult> {
  const authenticatedEnvs = await getAuthenticatedEnvironments();

  if (authenticatedEnvs.length === 0) {
    throw new Error("No authenticated environments found. Run `agentlogs login` first.");
  }

  const results: EnvUploadResult[] = [];
  let eventCount = 0;
  let id = "";
  let sessionId = "";

  for (const env of authenticatedEnvs) {
    try {
      const result = await performUpload(params, {
        serverUrl: env.baseURL,
        authToken: env.token,
      });

      // Capture event count, id, and session ID from first successful upload
      if (result.success && eventCount === 0) {
        eventCount = result.eventCount;
        id = result.id ?? "";
        sessionId = result.sessionId;
      }

      results.push({
        envName: env.name,
        baseURL: env.baseURL,
        success: result.success,
        id: result.id,
        transcriptId: result.transcriptId,
      });
    } catch (error) {
      results.push({
        envName: env.name,
        baseURL: env.baseURL,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    results,
    eventCount,
    id,
    sessionId,
    anySuccess: results.some((r) => r.success),
    allSuccess: results.every((r) => r.success),
  };
}
