/**
 * Shared utilities for CLI hooks (Claude Code and OpenCode)
 */

import { createLogger } from "@agentlogs/shared/logger";
import { getAuthenticatedEnvironments } from "../config";
import { getOrCreateTranscriptId } from "../local-store";

const HOOK_LOG_PATH = "/tmp/agentlogs.log";

function shouldEnableHookFileLogging(): boolean {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") {
    return false;
  }

  // Explicit opt-in for debugging installed builds.
  if (process.env.AGENTLOGS_DEBUG_LOGS === "true") {
    return true;
  }

  // Enable automatically when running from TypeScript source in local dev.
  return import.meta.url.endsWith(".ts");
}

// Create logger for hook commands
export const hookLogger = createLogger("cli", {
  logFilePath: HOOK_LOG_PATH,
  logToFile: shouldEnableHookFileLogging(),
  disableConsole: true,
});

// ============================================================================
// Git Commit Detection & Modification
// ============================================================================

const DEFAULT_TRANSCRIPT_BASE_URL = "https://agentlogs.ai";
const TRANSCRIPT_URL_REGEX = /https?:\/\/[^\s"'`]+\/s\/([a-zA-Z0-9_-]+)/;

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isLocalBaseUrl(baseURL: string): boolean {
  try {
    const url = new URL(baseURL);
    return isLocalHostname(url.hostname);
  } catch {
    return false;
  }
}

function normalizeTranscriptBaseUrl(baseURL: string): string {
  try {
    const url = new URL(baseURL);
    return `${url.protocol}//${url.host.toLowerCase()}`;
  } catch {
    return baseURL.replace(/\/+$/, "");
  }
}

/**
 * Pick the preferred transcript host from authenticated environments.
 *
 * Selection rule:
 * - choose the first non-localhost environment
 * - if all are localhost, choose the first localhost one
 */
export function selectPreferredTranscriptBaseUrl(environments: Array<{ baseURL: string }>): string {
  const preferred = environments.find((env) => !isLocalBaseUrl(env.baseURL)) ?? environments[0];
  return normalizeTranscriptBaseUrl(preferred?.baseURL ?? DEFAULT_TRANSCRIPT_BASE_URL);
}

export async function getPreferredTranscriptBaseUrl(): Promise<string> {
  const authenticatedEnvironments = await getAuthenticatedEnvironments();
  return selectPreferredTranscriptBaseUrl(authenticatedEnvironments);
}

/**
 * Check if a command contains a git commit
 */
export function containsGitCommit(command: string): boolean {
  return /\bgit\s+commit\b/.test(command);
}

/**
 * Append a transcript link to a git commit message
 */
export function appendTranscriptLink(command: string, id: string, transcriptBaseURL?: string): string {
  const baseURL = normalizeTranscriptBaseUrl(transcriptBaseURL ?? DEFAULT_TRANSCRIPT_BASE_URL);
  const linkText = `🔮 View transcript: ${baseURL}/s/${id}`;

  if (command.includes(linkText) || extractTranscriptIdFromOutput(command) === id) {
    return command;
  }

  const suffix = `\n\n${linkText}`;

  // Patterns for different git commit message formats
  // Order matters: check quoted forms first, then unquoted
  // Only match the FIRST occurrence to handle multiple -m flags
  const patterns: Array<{
    regex: RegExp;
    quote: string;
    equalsForm: boolean;
    unquoted?: boolean;
  }> = [
    // --message="msg" or --message='msg' (equals sign form)
    { regex: /(\s--message=)"([^"]*)"/, quote: '"', equalsForm: true },
    { regex: /(\s--message=)'([^']*)'/, quote: "'", equalsForm: true },
    // -m "msg", --message "msg", -am "msg" (space-separated quoted form)
    { regex: /(\s(?:-m|--message|-am))\s+"([^"]*)"/, quote: '"', equalsForm: false },
    { regex: /(\s(?:-m|--message|-am))\s+'([^']*)'/, quote: "'", equalsForm: false },
    // --message=msg (unquoted equals form)
    { regex: /(\s--message=)([^\s"'][^\s]*)(\s|$)/, quote: '"', equalsForm: true, unquoted: true },
    // -m msg, -am msg (unquoted space-separated - matches until next space or end)
    { regex: /(\s(?:-m|--message|-am))\s+([^\s"'-][^\s]*)(\s|$)/, quote: '"', equalsForm: false, unquoted: true },
  ];

  for (const { regex, quote, equalsForm, unquoted } of patterns) {
    const match = command.match(regex);
    if (match) {
      const flag = match[1];
      const message = match[2];
      const trailing = match[3] || "";
      // Only replace the first match (handles multiple -m flags)
      if (unquoted && equalsForm) {
        // --message=msg → --message="msg\n\nlink"
        return command.replace(regex, `${flag}${quote}${message}${suffix}${quote}${trailing}`);
      }
      if (unquoted) {
        // -m msg → -m "msg\n\nlink"
        return command.replace(regex, `${flag} ${quote}${message}${suffix}${quote}${trailing}`);
      }
      if (equalsForm) {
        return command.replace(regex, `${flag}${quote}${message}${suffix}${quote}`);
      }
      return command.replace(regex, `${flag} ${quote}${message}${suffix}${quote}`);
    }
  }

  return command;
}

/**
 * Extract transcript ID from command output (for tracking commits)
 */
export function extractTranscriptIdFromOutput(output: string): string | undefined {
  // Find all transcript links and return the last one
  const regex = new RegExp(TRANSCRIPT_URL_REGEX.source, "g");
  const matches = [...output.matchAll(regex)];
  if (matches.length === 0) {
    return undefined;
  }
  return matches[matches.length - 1][1];
}

/**
 * Parse commit SHA from git commit output
 * Format: "[branch sha] message" or "[branch (root-commit) sha] message"
 */
export function parseCommitShaFromOutput(output: string): string | undefined {
  const match = output.match(/\[[\w/-]+(?:\s+\([^)]+\))?\s+([a-f0-9]{7,40})\]/);
  return match ? match[1] : undefined;
}

/**
 * Parse commit title from git commit output
 */
export function parseCommitTitleFromOutput(output: string): string | undefined {
  const match = output.match(/\[[\w/-]+(?:\s+\([^)]+\))?\s+[a-f0-9]{7,40}\]\s+(.+)/);
  return match ? match[1].trim() : undefined;
}

/**
 * Parse branch name from git commit output
 */
export function parseBranchFromOutput(output: string): string | undefined {
  const match = output.match(/\[([\w/-]+)(?:\s+\([^)]+\))?\s+[a-f0-9]{7,40}\]/);
  return match ? match[1] : undefined;
}

// ============================================================================
// Commit Tracking
// ============================================================================

export interface CommitTrackingPayload {
  transcriptId: string;
  repoPath: string;
  timestamp: string;
  commitSha?: string;
  commitTitle?: string;
  branch?: string;
}

/**
 * Track a commit by sending it to all authenticated environments
 */
export async function trackCommit(payload: CommitTrackingPayload): Promise<void> {
  const authenticatedEnvs = await getAuthenticatedEnvironments();
  if (authenticatedEnvs.length === 0) {
    hookLogger.warn("Commit tracking skipped: no authenticated environments", {
      transcriptId: payload.transcriptId.substring(0, 8),
    });
    return;
  }

  for (const env of authenticatedEnvs) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(new URL("/api/commit-track", env.baseURL), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.token}`,
        },
        body: JSON.stringify({
          transcript_id: payload.transcriptId,
          repo_path: payload.repoPath,
          timestamp: payload.timestamp,
          commit_sha: payload.commitSha,
          commit_title: payload.commitTitle,
          branch: payload.branch,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        hookLogger.warn(`Commit tracking to ${env.name} failed`, {
          transcriptId: payload.transcriptId.substring(0, 8),
          status: response.status,
        });
        continue;
      }

      hookLogger.info(`Commit tracked (${env.name})`, {
        transcriptId: payload.transcriptId.substring(0, 8),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        hookLogger.warn(`Commit tracking to ${env.name} timed out`, {
          transcriptId: payload.transcriptId.substring(0, 8),
        });
        continue;
      }
      hookLogger.error(`Commit tracking to ${env.name} error`, {
        transcriptId: payload.transcriptId.substring(0, 8),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ============================================================================
// Stdin Reading
// ============================================================================

const STDIN_PREVIEW_SIZE = 2048;

/**
 * Read stdin with a preview for quick filtering
 */
export function readStdinWithPreview(): Promise<{ preview: string; full: string }> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve({
        preview: data.slice(0, STDIN_PREVIEW_SIZE),
        full: data,
      });
    });
    process.stdin.on("error", (error) => reject(error));
  });
}

// Re-export for convenience
export {
  getOrCreateTranscriptId,
  cacheCallTranscriptId,
  getCallTranscriptId,
  deleteCallTranscriptId,
} from "../local-store";
