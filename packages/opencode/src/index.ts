/**
 * AgentLogs OpenCode Plugin
 *
 * Lightweight plugin that captures OpenCode session data and uploads via the agentlogs CLI.
 * No external dependencies - all heavy lifting is done by the CLI.
 *
 * @example
 * // opencode.json
 * { "plugin": ["@agentlogs/opencode"] }
 */

import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";

// ============================================================================
// Debug Logging
// ============================================================================

const LOG_FILE = "/tmp/agentlogs-opencode.log";

function log(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const logLine = data
    ? `[${timestamp}] ${message}\n${JSON.stringify(data, null, 2)}\n`
    : `[${timestamp}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, logLine);
  } catch {
    // Ignore write errors
  }
}

// ============================================================================
// Types (minimal, no external deps)
// ============================================================================

interface PluginContext {
  directory: string;
  worktree?: string;
  project?: { id: string; path: string };
}

interface SessionInfo {
  isSubagent: boolean;
  transcriptUrl: string | null;
}

interface PluginState {
  // Track sessions: sessionId → info
  sessions: Map<string, SessionInfo>;
  // Currently uploading session IDs (to prevent concurrent uploads)
  uploading: Set<string>;
}

// ============================================================================
// CLI Integration
// ============================================================================

interface UploadResult {
  success: boolean;
  transcriptId?: string;
  transcriptUrl?: string;
  error?: string;
}

/**
 * Upload transcript by shelling out to the agentlogs CLI.
 * Passes session ID - CLI reads directly from OpenCode storage.
 * Uses $VI_CLI_PATH if set, otherwise falls back to npx.
 */
async function uploadViaCli(sessionId: string, cwd: string): Promise<UploadResult> {
  // Use VI_CLI_PATH if set, otherwise fall back to npx
  // VI_CLI_PATH can be "bun /path/to/cli.ts" or just "/path/to/agentlogs"
  const cliPath = process.env.VI_CLI_PATH;

  let command: string;
  let args: string[];

  if (cliPath) {
    const parts = cliPath.split(" ");
    command = parts[0];
    args = [...parts.slice(1), "opencode", "upload", sessionId];
  } else {
    command = "npx";
    args = ["-y", "agentlogs@latest", "opencode", "upload", sessionId];
  }

  log("Spawning CLI", { command, args, sessionId });

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      log("CLI process exited", { code, stdout, stderr });

      if (code === 0) {
        // Parse JSON output from CLI
        try {
          const result = JSON.parse(stdout.trim());
          resolve({
            success: true,
            transcriptId: result.transcriptId,
            transcriptUrl: result.transcriptUrl,
          });
        } catch {
          resolve({
            success: true,
            error: "Failed to parse CLI output",
          });
        }
      } else {
        resolve({
          success: false,
          error: stderr || `CLI exited with code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      log("CLI spawn error", { error: String(err) });
      resolve({
        success: false,
        error: `Failed to spawn agentlogs CLI: ${err.message}`,
      });
    });
  });
}

// ============================================================================
// Git Utilities
// ============================================================================

function isGitCommitCommand(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, unknown>;

  const cmd = Array.isArray(record.command)
    ? record.command.join(" ")
    : typeof record.command === "string"
      ? record.command
      : "";

  return /\bgit\s+commit\b/.test(cmd);
}

function appendTranscriptLinkToCommit(input: unknown, transcriptUrl: string): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const record = { ...(input as Record<string, unknown>) };

  let cmdString: string;
  if (Array.isArray(record.command)) {
    cmdString = record.command.join(" ");
  } else if (typeof record.command === "string") {
    cmdString = record.command;
  } else {
    return null;
  }

  // Extract existing message
  const messageMatch = cmdString.match(/-m\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const existingMessage = messageMatch?.[1] || messageMatch?.[2] || messageMatch?.[3];
  if (!existingMessage) return null;

  const newMessage = `${existingMessage}\n\nTranscript: ${transcriptUrl}`;

  if (Array.isArray(record.command)) {
    const cmdArray = [...(record.command as string[])];
    for (let i = 0; i < cmdArray.length; i++) {
      if (cmdArray[i] === "-m" && i + 1 < cmdArray.length) {
        cmdArray[i + 1] = newMessage;
        break;
      }
    }
    record.command = cmdArray;
  } else {
    record.command = cmdString.replace(/-m\s+(?:"[^"]+"|'[^']+'|\S+)/, `-m "${newMessage.replace(/"/g, '\\"')}"`);
  }

  return record;
}

// ============================================================================
// Main Plugin
// ============================================================================

export const agentLogsPlugin = async (ctx: PluginContext) => {
  const state: PluginState = {
    sessions: new Map(),
    uploading: new Set(),
  };

  log("Plugin initialized", {
    directory: ctx.directory,
    projectId: ctx.project?.id,
  });

  return {
    event: async (rawEvent: any) => {
      // OpenCode wraps events: { event: { type, properties } }
      const event = rawEvent?.event ?? rawEvent;
      const eventType = event?.type;
      const properties = event?.properties;

      log(`Event: ${eventType}`, properties);

      if (eventType === "session.created") {
        const sessionId = properties?.info?.id;
        const parentId = properties?.info?.parentID;
        const isSubagent = !!parentId;

        if (sessionId) {
          state.sessions.set(sessionId, {
            isSubagent,
            transcriptUrl: null,
          });
          log("Session created", { sessionId, isSubagent, parentId });
        }
      }

      if (eventType === "session.idle") {
        // Use session ID from the event, not from state
        const sessionId = properties?.sessionID;
        if (!sessionId) return;

        const session = state.sessions.get(sessionId);

        // Skip subagent sessions
        if (session?.isSubagent) {
          log("Skipping subagent session", { sessionId });
          return;
        }

        // Skip if already uploading this session
        if (state.uploading.has(sessionId)) {
          log("Already uploading session", { sessionId });
          return;
        }

        state.uploading.add(sessionId);
        log("Session idle, uploading", { sessionId });

        try {
          // Upload via CLI - it reads directly from OpenCode storage
          const result = await uploadViaCli(sessionId, ctx.directory);

          if (result.success && result.transcriptUrl) {
            // Store transcript URL for this session (for git commit linking)
            if (session) {
              session.transcriptUrl = result.transcriptUrl;
            }
            log("Upload success", { sessionId, url: result.transcriptUrl });
          } else {
            log("Upload failed", { sessionId, error: result.error });
          }
        } catch (error) {
          log("Session idle error", { sessionId, error: String(error) });
        } finally {
          state.uploading.delete(sessionId);
        }
      }
    },

    tool: {
      execute: {
        before: async (args: { name: string; input: unknown }) => {
          // Intercept git commits to add transcript link
          // Use the most recent non-subagent session's transcript URL
          let transcriptUrl: string | null = null;
          for (const [, session] of state.sessions) {
            if (!session.isSubagent && session.transcriptUrl) {
              transcriptUrl = session.transcriptUrl;
            }
          }

          if ((args.name === "shell" || args.name === "bash") && isGitCommitCommand(args.input) && transcriptUrl) {
            log("Intercepting git commit", { transcriptUrl });
            const modified = appendTranscriptLinkToCommit(args.input, transcriptUrl);
            if (modified) {
              log("Added transcript link to commit");
              return { ...args, input: modified };
            }
          }
          return args;
        },
      },
    },
  };
};

export default agentLogsPlugin;
