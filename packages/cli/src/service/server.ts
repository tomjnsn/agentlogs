#!/usr/bin/env node

/**
 * AgentLogs Service (agentlogsd)
 *
 * A long-running daemon that:
 * - Watches ~/.codex/sessions for transcript changes using Parcel Watcher
 * - Watches ~/.cline/data/tasks for Cline transcript changes
 * - Polls tracked session files for turn completion (token_count changes)
 * - Manages connections from MCP servers via Unix socket
 * - Shuts down gracefully after a grace period when all connections close
 */

import { convertClineFile, LiteLLMPricingFetcher } from "@agentlogs/shared";
import { resolveGitContext } from "@agentlogs/shared/claudecode";
import { type AsyncSubscription, subscribe } from "@parcel/watcher";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import type { Server, Socket } from "net";
import { basename, dirname, join } from "path";
import { performUploadToAllEnvs, uploadUnifiedToAllEnvs } from "../lib/perform-upload";
import { createIPCServer, type StatusResponse } from "./ipc";
import { CLINE_TASKS_DIR, CODEX_SESSIONS_DIR, SERVICE_LOG_FILE, SERVICE_PID_FILE, WATCHER_LOG_FILE } from "./paths";

// Grace period before shutdown when all connections close (30 seconds)
const SHUTDOWN_GRACE_PERIOD_MS = 30_000;

// Poll interval for checking mtime changes (15 seconds)
const POLL_INTERVAL_MS = 15_000;

// Only track files modified in the last 1 day on startup
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// State
// ============================================================================

const connections = new Map<string, Socket>();
let codexWatcherSubscription: AsyncSubscription | null = null;
let clineWatcherSubscription: AsyncSubscription | null = null;
let ipcServer: Server | null = null;
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastWatcherEvent: { type: string; path: string; timestamp: number } | undefined;
const startTime = Date.now();

// Session tracking: path -> { mtime, lastAgentMessageTs, isNew }
interface TrackedSession {
  mtime: number;
  lastAgentMessageTs: string | null;
  isNewSession: boolean; // True if created during this service run (should upload first agent_message)
}
const trackedSessions = new Map<string, TrackedSession>();

interface TrackedClineTask {
  mtime: number;
  lastAssistantCount: number;
  isNewTask: boolean; // True if created during this service run (should upload first assistant response)
}
const trackedClineTasks = new Map<string, TrackedClineTask>();

// ============================================================================
// Logging
// ============================================================================

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function log(level: string, message: string, meta?: Record<string, unknown>) {
  const now = new Date();
  const timestamp = now.toISOString();
  const logLine = `[${timestamp}] [service] [${level}] ${message}`;

  console.log(logLine, meta ? JSON.stringify(meta) : "");

  ensureDir(SERVICE_LOG_FILE);
  try {
    appendFileSync(SERVICE_LOG_FILE, logLine + (meta ? " " + JSON.stringify(meta) : "") + "\n");
  } catch {
    // Ignore file write errors
  }
}

function logWatcherEvent(event: { type: string; path: string; reason?: string }) {
  const timestamp = Date.now();
  const logEntry = JSON.stringify({ ...event, timestamp }) + "\n";

  ensureDir(WATCHER_LOG_FILE);
  try {
    appendFileSync(WATCHER_LOG_FILE, logEntry);
  } catch {
    // Ignore file write errors
  }

  lastWatcherEvent = { type: event.type, path: event.path, timestamp };
}

// ============================================================================
// Session Tracking
// ============================================================================

/**
 * Find the last agent_message timestamp in a session file
 */
function getLastAgentMessageTimestamp(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");

    // Search from end for last agent_message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const line = JSON.parse(lines[i]);
        if (line.type === "event_msg" && line.payload?.type === "agent_message") {
          return line.timestamp;
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  } catch {
    // File read error
  }
  return null;
}

const CLINE_TASK_FILE_REGEX = /[/\\]tasks[/\\]\d+[/\\]api_conversation_history\.json$/;
const CLINE_CWD_REGEX = /# Current Working Directory \(([^)\n]+)\) Files/m;

function isClineTaskFile(filePath: string): boolean {
  return CLINE_TASK_FILE_REGEX.test(filePath);
}

/**
 * Count assistant messages in Cline's api_conversation_history.json.
 */
function getClineAssistantMessageCount(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return 0;
    }

    let count = 0;
    for (const message of parsed) {
      if (typeof message === "object" && message !== null && (message as { role?: unknown }).role === "assistant") {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Extract working directory from Cline environment details text.
 */
function getClineCwd(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    for (let i = parsed.length - 1; i >= 0; i--) {
      const message = parsed[i];
      if (typeof message !== "object" || message === null || (message as { role?: unknown }).role !== "user") {
        continue;
      }

      const contentBlocks = (message as { content?: unknown }).content;
      if (!Array.isArray(contentBlocks)) {
        continue;
      }

      for (const block of contentBlocks) {
        if (typeof block !== "object" || block === null || (block as { type?: unknown }).type !== "text") {
          continue;
        }
        const text = (block as { text?: unknown }).text;
        if (typeof text !== "string") {
          continue;
        }
        const match = text.match(CLINE_CWD_REGEX);
        if (match?.[1]) {
          return match[1].trim();
        }
      }
    }
  } catch {
    // Ignore parse/read errors
  }

  return null;
}

/**
 * Add a session file to tracking
 */
function trackSession(filePath: string, isNew: boolean = false) {
  if (!filePath.endsWith(".jsonl")) return;

  try {
    const stat = statSync(filePath);
    const lastAgentMessageTs = getLastAgentMessageTimestamp(filePath);

    trackedSessions.set(filePath, {
      mtime: stat.mtimeMs,
      lastAgentMessageTs,
      isNewSession: isNew, // New sessions should upload on first agent_message
    });

    log("DEBUG", `Tracking session: ${filePath}`, {
      isNew,
      lastAgentMessageTs,
    });
  } catch (err) {
    log("ERROR", `Failed to track session: ${filePath}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function trackClineTask(filePath: string, isNew: boolean = false): TrackedClineTask | null {
  if (!isClineTaskFile(filePath)) return null;

  try {
    const stat = statSync(filePath);
    const assistantCount = getClineAssistantMessageCount(filePath);

    const trackedTask: TrackedClineTask = {
      mtime: stat.mtimeMs,
      lastAssistantCount: assistantCount,
      isNewTask: isNew,
    };
    trackedClineTasks.set(filePath, trackedTask);

    log("DEBUG", `Tracking Cline task: ${filePath}`, {
      isNew,
      assistantCount,
    });
    return trackedTask;
  } catch (err) {
    log("ERROR", `Failed to track Cline task: ${filePath}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function maybeUploadNewClineTask(filePath: string) {
  const tracked = trackedClineTasks.get(filePath);
  if (!tracked || !tracked.isNewTask || tracked.lastAssistantCount === 0) {
    return;
  }

  log("INFO", `Cline new task has assistant message(s), uploading: ${filePath}`, {
    assistantCount: tracked.lastAssistantCount,
  });
  logWatcherEvent({
    type: "cline_turn_complete",
    path: filePath,
    reason: "assistant_message_on_create",
  });

  tracked.isNewTask = false;

  uploadClineTask(filePath).catch((err) => {
    log("ERROR", `Cline upload failed: ${filePath}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Scan for recent session files on startup
 */
function scanExistingSessions() {
  const now = Date.now();
  let count = 0;

  function scanDir(dir: string) {
    if (!existsSync(dir)) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith(".jsonl")) {
          try {
            const stat = statSync(fullPath);
            if (now - stat.mtimeMs < MAX_FILE_AGE_MS) {
              trackSession(fullPath, false);
              count++;
            }
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  scanDir(CODEX_SESSIONS_DIR);
  log("INFO", `Scanned existing sessions`, { count });
}

function scanExistingClineTasks() {
  const now = Date.now();
  let count = 0;

  if (!existsSync(CLINE_TASKS_DIR)) {
    log("INFO", `Cline tasks directory not found: ${CLINE_TASKS_DIR}`);
    return;
  }

  try {
    const entries = readdirSync(CLINE_TASKS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/^\d+$/.test(entry.name)) continue;

      const transcriptPath = join(CLINE_TASKS_DIR, entry.name, "api_conversation_history.json");
      if (!existsSync(transcriptPath)) continue;

      try {
        const stat = statSync(transcriptPath);
        if (now - stat.mtimeMs < MAX_FILE_AGE_MS) {
          trackClineTask(transcriptPath, false);
          count += 1;
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Skip unreadable Cline tasks dir
  }

  log("INFO", `Scanned existing Cline tasks`, { count });
}

/**
 * Check a session file for turn completion (new agent_message)
 */
function checkSessionForTurnComplete(filePath: string) {
  const tracked = trackedSessions.get(filePath);
  if (!tracked) return;

  try {
    const stat = statSync(filePath);

    // Check if mtime changed
    if (stat.mtimeMs <= tracked.mtime) return;

    // mtime changed, update it
    tracked.mtime = stat.mtimeMs;

    // Check for new agent_message
    const newAgentMessageTs = getLastAgentMessageTimestamp(filePath);

    if (newAgentMessageTs && newAgentMessageTs !== tracked.lastAgentMessageTs) {
      const isFirstDiscovery = tracked.lastAgentMessageTs === null;
      tracked.lastAgentMessageTs = newAgentMessageTs;

      // Upload if:
      // - Not first discovery (subsequent agent messages), OR
      // - First discovery on a NEW session (created during this service run)
      if (!isFirstDiscovery || tracked.isNewSession) {
        log("INFO", `Turn completed: ${filePath}`, {
          agentMessageTs: newAgentMessageTs,
        });
        logWatcherEvent({
          type: "turn_complete",
          path: filePath,
          reason: "agent_message",
        });

        // Clear isNewSession flag after first upload
        tracked.isNewSession = false;

        // Trigger upload (fire and forget, don't block polling)
        uploadSession(filePath).catch((err) => {
          log("ERROR", `Upload failed: ${filePath}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }
  } catch {
    // File might have been deleted
  }
}

function checkClineTaskForTurnComplete(filePath: string) {
  const tracked = trackedClineTasks.get(filePath);
  if (!tracked) return;

  try {
    const stat = statSync(filePath);
    if (stat.mtimeMs <= tracked.mtime) return;

    tracked.mtime = stat.mtimeMs;

    const newAssistantCount = getClineAssistantMessageCount(filePath);
    if (newAssistantCount <= tracked.lastAssistantCount) {
      return;
    }

    const isFirstDiscovery = tracked.lastAssistantCount === 0;
    tracked.lastAssistantCount = newAssistantCount;

    if (!isFirstDiscovery || tracked.isNewTask) {
      log("INFO", `Cline turn completed: ${filePath}`, {
        assistantCount: newAssistantCount,
      });
      logWatcherEvent({
        type: "cline_turn_complete",
        path: filePath,
        reason: "assistant_message",
      });

      tracked.isNewTask = false;

      uploadClineTask(filePath).catch((err) => {
        log("ERROR", `Cline upload failed: ${filePath}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  } catch {
    // File might have been deleted
  }
}

/**
 * Upload a session transcript
 */
async function uploadSession(filePath: string): Promise<void> {
  log("INFO", `Uploading session: ${filePath}`);

  try {
    const result = await performUploadToAllEnvs({
      transcriptPath: filePath,
      source: "codex",
    });

    if (result.anySuccess) {
      log("INFO", `Upload succeeded: ${filePath}`, {
        id: result.id,
        eventCount: result.eventCount,
        envs: result.results.filter((r) => r.success).map((r) => r.envName),
      });
      logWatcherEvent({ type: "upload_success", path: filePath });
    } else {
      log("WARN", `Upload failed for all envs: ${filePath}`, {
        errors: result.results.map((r) => ({ env: r.envName, error: r.error })),
      });
      logWatcherEvent({ type: "upload_failed", path: filePath });
    }
  } catch (err) {
    log("ERROR", `Upload error: ${filePath}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    logWatcherEvent({ type: "upload_error", path: filePath });
    throw err;
  }
}

async function uploadClineTask(filePath: string): Promise<void> {
  log("INFO", `Uploading Cline task: ${filePath}`);

  try {
    const cwd = getClineCwd(filePath) ?? "";
    const pricingFetcher = new LiteLLMPricingFetcher();
    const pricingData = await pricingFetcher.fetchModelPricing();
    const pricing = Object.fromEntries(pricingData);
    const gitContext = cwd ? await resolveGitContext(cwd, undefined) : null;

    const conversion = await convertClineFile(filePath, {
      pricing,
      gitContext,
      cwd: cwd || undefined,
      taskId: basename(dirname(filePath)),
    });

    if (!conversion) {
      log("WARN", `Skipping Cline task upload (conversion failed): ${filePath}`);
      logWatcherEvent({
        type: "cline_upload_skipped",
        path: filePath,
        reason: "conversion_failed",
      });
      return;
    }

    const rawTranscript = readFileSync(filePath, "utf-8");

    const result = await uploadUnifiedToAllEnvs({
      unifiedTranscript: conversion.transcript,
      sessionId: conversion.transcript.id,
      cwd,
      rawTranscript,
      blobs: Array.from(conversion.blobs.entries()).map(([sha256, blob]) => ({
        sha256,
        data: new Uint8Array(blob.data),
        mediaType: blob.mediaType,
      })),
    });

    if (result.skipped) {
      log("INFO", `Cline upload skipped by allowlist: ${filePath}`);
      logWatcherEvent({
        type: "cline_upload_skipped",
        path: filePath,
        reason: "allowlist",
      });
      return;
    }

    if (result.anySuccess) {
      log("INFO", `Cline upload succeeded: ${filePath}`, {
        id: result.id,
        envs: result.results.filter((r) => r.success).map((r) => r.envName),
      });
      logWatcherEvent({ type: "cline_upload_success", path: filePath });
    } else {
      log("WARN", `Cline upload failed for all envs: ${filePath}`, {
        errors: result.results.map((r) => ({ env: r.envName, error: r.error })),
      });
      logWatcherEvent({ type: "cline_upload_failed", path: filePath });
    }
  } catch (err) {
    log("ERROR", `Cline upload error: ${filePath}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    logWatcherEvent({ type: "cline_upload_error", path: filePath });
    throw err;
  }
}

/**
 * Poll all tracked sessions for changes
 */
function pollSessions() {
  for (const filePath of trackedSessions.keys()) {
    checkSessionForTurnComplete(filePath);
  }

  for (const filePath of trackedClineTasks.keys()) {
    checkClineTaskForTurnComplete(filePath);
  }
}

// ============================================================================
// Connection Management
// ============================================================================

function onConnect(id: string, socket: Socket) {
  connections.set(id, socket);
  log("INFO", `Connection added: ${id}`, { total: connections.size });

  // Cancel any pending shutdown
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
    log("INFO", "Shutdown cancelled - new connection");
  }
}

function onDisconnect(id: string) {
  connections.delete(id);
  log("INFO", `Connection removed: ${id}`, { total: connections.size });
  checkShutdown();
}

function checkShutdown() {
  if (connections.size > 0) return;
  if (clineWatcherSubscription) return;

  log("INFO", `No connections remaining, starting ${SHUTDOWN_GRACE_PERIOD_MS}ms grace period`);

  shutdownTimer = setTimeout(() => {
    // Re-check in case a new connection came in
    if (connections.size > 0) {
      log("INFO", "Shutdown aborted - new connections appeared");
      return;
    }

    log("INFO", "Grace period elapsed, shutting down");
    cleanup();
    process.exit(0);
  }, SHUTDOWN_GRACE_PERIOD_MS);
}

function getStatus(): StatusResponse {
  return {
    connections: connections.size,
    watching: codexWatcherSubscription !== null || clineWatcherSubscription !== null,
    lastEvent: lastWatcherEvent,
    uptime: Date.now() - startTime,
  };
}

// ============================================================================
// Cleanup
// ============================================================================

function cleanup() {
  log("INFO", "Cleaning up...");

  // Stop poll timer
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // Stop watchers
  if (codexWatcherSubscription) {
    codexWatcherSubscription.unsubscribe().catch(() => {});
    codexWatcherSubscription = null;
  }
  if (clineWatcherSubscription) {
    clineWatcherSubscription.unsubscribe().catch(() => {});
    clineWatcherSubscription = null;
  }

  // Close IPC server
  if (ipcServer) {
    ipcServer.close();
    ipcServer = null;
  }

  // Remove PID file
  try {
    if (existsSync(SERVICE_PID_FILE)) {
      unlinkSync(SERVICE_PID_FILE);
    }
  } catch {
    // Ignore
  }

  log("INFO", "Cleanup complete");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log("INFO", "Starting agentlogs service");

  // Ensure base directory exists
  ensureDir(SERVICE_PID_FILE);

  // Write PID file
  writeFileSync(SERVICE_PID_FILE, process.pid.toString());
  log("INFO", `PID file written: ${SERVICE_PID_FILE}`, { pid: process.pid });

  // Start IPC server
  ipcServer = createIPCServer({
    onConnect,
    onDisconnect,
    onStatus: getStatus,
    onShutdown: () => {
      log("INFO", "Shutdown requested via IPC");
      cleanup();
      process.exit(0);
    },
  });
  log("INFO", "IPC server started");

  // Scan for existing sessions
  scanExistingSessions();
  scanExistingClineTasks();

  // Start Parcel Watcher on Codex sessions directory
  if (existsSync(CODEX_SESSIONS_DIR)) {
    try {
      codexWatcherSubscription = await subscribe(CODEX_SESSIONS_DIR, (err, events) => {
        if (err) {
          log("ERROR", "Codex watcher error", { error: err.message });
          return;
        }

        for (const event of events) {
          log("DEBUG", `Watcher event: ${event.type}`, { path: event.path });

          if (event.type === "create" && event.path.endsWith(".jsonl")) {
            // New session file - add to tracking
            trackSession(event.path, true);
            logWatcherEvent({ type: "create", path: event.path });
          } else if (event.type === "update" && event.path.endsWith(".jsonl")) {
            // File was closed/flushed - check for turn completion
            logWatcherEvent({
              type: "update",
              path: event.path,
              reason: "file_closed",
            });
            checkSessionForTurnComplete(event.path);
          } else if (event.type === "delete" && event.path.endsWith(".jsonl")) {
            // File deleted - remove from tracking
            trackedSessions.delete(event.path);
            logWatcherEvent({ type: "delete", path: event.path });
          }
        }
      });
      log("INFO", `Watching Codex sessions: ${CODEX_SESSIONS_DIR}`);
    } catch (err) {
      log("ERROR", "Failed to start Codex watcher", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    log("WARN", `Codex sessions directory not found: ${CODEX_SESSIONS_DIR}`);
  }

  // Start Parcel Watcher on Cline tasks directory
  if (existsSync(CLINE_TASKS_DIR)) {
    try {
      clineWatcherSubscription = await subscribe(CLINE_TASKS_DIR, (err, events) => {
        if (err) {
          log("ERROR", "Cline watcher error", { error: err.message });
          return;
        }

        for (const event of events) {
          if (!isClineTaskFile(event.path)) {
            continue;
          }

          log("DEBUG", `Cline watcher event: ${event.type}`, {
            path: event.path,
          });

          if (event.type === "create") {
            trackClineTask(event.path, true);
            logWatcherEvent({ type: "cline_create", path: event.path });
            maybeUploadNewClineTask(event.path);
          } else if (event.type === "update") {
            if (!trackedClineTasks.has(event.path)) {
              trackClineTask(event.path, true);
              maybeUploadNewClineTask(event.path);
            }
            logWatcherEvent({
              type: "cline_update",
              path: event.path,
              reason: "file_closed",
            });
            checkClineTaskForTurnComplete(event.path);
          } else if (event.type === "delete") {
            trackedClineTasks.delete(event.path);
            logWatcherEvent({ type: "cline_delete", path: event.path });
          }
        }
      });
      log("INFO", `Watching Cline tasks: ${CLINE_TASKS_DIR}`);
    } catch (err) {
      log("ERROR", "Failed to start Cline watcher", {
        error: err instanceof Error ? err.message : String(err),
        root: CLINE_TASKS_DIR,
      });
    }
  } else {
    log("DEBUG", `Cline tasks directory not found: ${CLINE_TASKS_DIR}`);
  }

  // Start polling for mtime/token_count changes
  pollTimer = setInterval(pollSessions, POLL_INTERVAL_MS);
  log("INFO", `Polling sessions every ${POLL_INTERVAL_MS}ms`);

  // Handle signals
  process.on("SIGTERM", () => {
    log("INFO", "Received SIGTERM");
    cleanup();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    log("INFO", "Received SIGINT");
    cleanup();
    process.exit(0);
  });

  // Start grace period timer (will shut down if no connections within grace period)
  checkShutdown();

  log("INFO", "Service ready");
}

main().catch((err) => {
  log("ERROR", "Service failed to start", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
