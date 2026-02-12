/**
 * AgentLogs Pi Extension
 *
 * Lightweight extension that shells out to the agentlogs CLI for all processing.
 * The CLI handles transcript uploads, git commit interception, and commit tracking.
 *
 * @example
 * // Install globally or in project
 * npm install -g @agentlogs/pi
 *
 * // Add to pi settings.json
 * { "extensions": ["@agentlogs/pi"] }
 *
 * // Or use the pi field in package.json
 * { "pi": { "extensions": ["@agentlogs/pi"] } }
 */

import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";

// ============================================================================
// Pi Types (inline to avoid external dependency)
// ============================================================================

interface ExtensionContext {
  cwd: string;
  sessionManager: {
    getSessionId(): string;
    getSessionFile(): string | undefined;
    getLeafId(): string | null;
  };
}

interface ToolCallEvent {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
}

interface ToolResultEvent {
  toolName: string;
  toolCallId: string;
  content?: Array<{ type: string; text?: string }>;
}

interface ExtensionAPI {
  on(event: "tool_call", handler: (event: ToolCallEvent, ctx: ExtensionContext) => void | Promise<void>): void;
  on(event: "tool_result", handler: (event: ToolResultEvent, ctx: ExtensionContext) => void | Promise<void>): void;
  on(event: "agent_end", handler: (event: unknown, ctx: ExtensionContext) => void | Promise<void>): void;
  on(event: "session_shutdown", handler: (event: unknown, ctx: ExtensionContext) => void | Promise<void>): void;
}

// ============================================================================
// Debug Logging (compiled out in production builds)
// ============================================================================

const LOG_FILE = "/tmp/agentlogs.log";
const TRANSCRIPT_LINK_REGEX = /https?:\/\/[^\s"'`]+\/s\/[a-zA-Z0-9_-]+/;

function log(message: string, data?: unknown): void {
  if (process.env.NODE_ENV === "production") return;
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
// Types
// ============================================================================

interface HookPayload {
  hook_event_name: string;
  session_id: string;
  tool_call_id?: string;
  tool?: string;
  cwd?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
  session_file?: string;
  leaf_id?: string;
}

interface HookResponse {
  modified: boolean;
  updatedInput?: Record<string, unknown>;
}

// ============================================================================
// CLI Integration
// ============================================================================

/**
 * Shell out to the agentlogs CLI hook command.
 * Passes hook data via stdin, receives response via stdout.
 */
async function runHook(payload: HookPayload, cwd: string): Promise<HookResponse> {
  const cliPath = process.env.AGENTLOGS_CLI_PATH;

  let command: string;
  let args: string[];

  if (cliPath) {
    const parts = cliPath.split(" ");
    command = parts[0];
    args = [...parts.slice(1), "pi", "hook"];
  } else {
    command = "npx";
    args = ["-y", "agentlogs@latest", "pi", "hook"];
  }

  log("Running hook", { command, args, payload: payload.hook_event_name });

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    // Send payload via stdin
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();

    proc.on("close", (code) => {
      log("Hook process exited", { code, stdout: stdout.slice(0, 500), stderr: stderr.slice(0, 500) });

      if (code === 0 && stdout.trim()) {
        try {
          const response = JSON.parse(stdout.trim()) as HookResponse;
          resolve(response);
        } catch {
          resolve({ modified: false });
        }
      } else {
        resolve({ modified: false });
      }
    });

    proc.on("error", (err) => {
      log("Hook spawn error", { error: String(err) });
      resolve({ modified: false });
    });
  });
}

// ============================================================================
// Main Extension
// ============================================================================

export default function agentLogsExtension(pi: ExtensionAPI) {
  log("Extension initialized");

  // Track tool call IDs where we intercepted a git commit
  const interceptedToolCallIds = new Set<string>();

  // Handle tool calls (intercept git commits)
  pi.on("tool_call", async (event, ctx) => {
    // Only intercept bash tool
    if (event.toolName !== "bash") {
      return;
    }

    // Quick check: skip if not a git commit
    const command = event.input?.command;
    if (typeof command !== "string" || !/\bgit\s+commit\b/.test(command)) {
      return;
    }

    // Skip if already has a transcript link
    if (TRANSCRIPT_LINK_REGEX.test(command)) {
      return;
    }

    log("tool_call (git commit)", {
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      originalCommand: command,
    });

    const sessionId = ctx.sessionManager.getSessionId();
    const sessionFile = ctx.sessionManager.getSessionFile();

    const response = await runHook(
      {
        hook_event_name: "tool_call",
        session_id: sessionId,
        tool_call_id: event.toolCallId,
        tool: event.toolName,
        tool_input: event.input as Record<string, unknown>,
        cwd: ctx.cwd,
        session_file: sessionFile,
      },
      ctx.cwd,
    );

    if (response.modified && response.updatedInput) {
      const updatedCommand = response.updatedInput.command;
      if (typeof updatedCommand === "string") {
        // Try mutating the input directly
        (event.input as Record<string, unknown>).command = updatedCommand;
        log("tool_call: mutated input", { updatedCommand });
      }
      // Track this tool call ID so we know to process the result
      interceptedToolCallIds.add(event.toolCallId);
    }
  });

  // Handle tool results (track commits)
  pi.on("tool_result", async (event, ctx) => {
    // Only handle bash tool
    if (event.toolName !== "bash") {
      return;
    }

    // Check if we intercepted this tool call
    const wasIntercepted = interceptedToolCallIds.has(event.toolCallId);

    // Also check if output contains our transcript link
    const outputText =
      event.content
        ?.map((c) => (c.type === "text" ? c.text : ""))
        .join("")
        .trim() ?? "";
    const hasLink = TRANSCRIPT_LINK_REGEX.test(outputText);

    if (!wasIntercepted && !hasLink) {
      return;
    }

    // Clean up tracked ID
    interceptedToolCallIds.delete(event.toolCallId);

    log("tool_result (git commit)", {
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      hasLink,
      wasIntercepted,
    });

    const sessionId = ctx.sessionManager.getSessionId();

    // Fire and forget - CLI handles commit tracking
    runHook(
      {
        hook_event_name: "tool_result",
        session_id: sessionId,
        tool_call_id: event.toolCallId,
        tool: event.toolName,
        tool_output: { content: outputText },
        cwd: ctx.cwd,
      },
      ctx.cwd,
    ).catch((err) => log("tool_result hook error", { error: String(err) }));
  });

  // Helper to trigger transcript upload
  const uploadTranscript = (eventName: string, ctx: ExtensionContext) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const sessionFile = ctx.sessionManager.getSessionFile();
    const leafId = ctx.sessionManager.getLeafId();

    if (!sessionFile) {
      log(`${eventName}: no session file (ephemeral session)`);
      return;
    }

    log(eventName, { sessionId, sessionFile, leafId });

    // Fire and forget - CLI handles the upload
    runHook(
      {
        hook_event_name: eventName,
        session_id: sessionId,
        session_file: sessionFile,
        leaf_id: leafId ?? undefined,
        cwd: ctx.cwd,
      },
      ctx.cwd,
    ).catch((err) => log(`${eventName} hook error`, { error: String(err) }));
  };

  // Handle agent end (upload after each turn)
  pi.on("agent_end", async (_event, ctx) => {
    uploadTranscript("agent_end", ctx);
  });

  // Handle session shutdown (final upload)
  pi.on("session_shutdown", async (_event, ctx) => {
    uploadTranscript("session_shutdown", ctx);
  });
}

export { agentLogsExtension };
