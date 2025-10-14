import { execSync } from "child_process";
import { resolve } from "path";
import type { UploadPayload, UploadResponse } from "./types";

const DEFAULT_SERVER_URL = "http://localhost:3000";
const DEFAULT_API_TOKEN = "dev_token";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface UploadOptions {
  serverUrl?: string;
  apiToken?: string;
  timeoutMs?: number;
}

/**
 * Upload transcript to Vibe Insights server.
 * Returns success status and optional transcript ID.
 */
export async function uploadTranscript(
  payload: UploadPayload,
  options: UploadOptions = {},
): Promise<{ success: boolean; transcriptId?: string }> {
  const serverUrl = options.serverUrl ?? process.env.VI_SERVER_URL ?? DEFAULT_SERVER_URL;
  const apiToken = options.apiToken ?? process.env.VI_API_TOKEN ?? DEFAULT_API_TOKEN;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const response = await fetch(`${serverUrl}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      console.error(`Upload failed: ${response.status} ${response.statusText}`);
      return { success: false };
    }

    const result = (await response.json()) as unknown;

    if (isUploadResponse(result)) {
      return {
        success: true,
        transcriptId: result.transcriptId,
      };
    }

    console.error("Upload succeeded but response had unexpected shape:", result);
    return { success: false };
  } catch (error) {
    if (error instanceof Error) {
      console.error("Upload error:", error.message);
    }
    return { success: false };
  }
}

function isUploadResponse(data: unknown): data is UploadResponse {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const maybeResponse = data as Partial<UploadResponse>;

  return (
    typeof maybeResponse.success === "boolean" &&
    (maybeResponse.success === false || typeof maybeResponse.transcriptId === "string") &&
    (maybeResponse.eventsReceived === undefined || typeof maybeResponse.eventsReceived === "number")
  );
}

/**
 * Get repository metadata from git.
 * Falls back to local path if not a git repo.
 */
export function getRepoMetadata(cwd: string): {
  repoId: string;
  repoName: string;
} {
  const resolvedCwd = resolve(cwd);

  try {
    const remoteUrl = execSync("git remote get-url origin", {
      cwd: resolvedCwd,
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    const repoName = remoteUrl.split("/").pop()?.replace(".git", "") || "unknown";

    return {
      repoId: remoteUrl,
      repoName,
    };
  } catch {
    const repoName = resolvedCwd.split("/").pop() || "unknown";
    return {
      repoId: `file://${resolvedCwd}`,
      repoName,
    };
  }
}
