import { promises as fs } from "fs";
import { convertClaudeCodeTranscript, type UnifiedTranscriptMessage } from "@vibeinsights/shared/claudecode";
import { createLogger } from "@vibeinsights/shared/logger";
import { getDevLogPath } from "@vibeinsights/shared/paths";
import type { UploadOptions } from "@vibeinsights/shared/upload";
import { getToken, readConfig } from "../config";
import { performUpload } from "../lib/perform-upload";

// Create logger for CLI hook commands
// Uses shared getDevLogPath() which finds the monorepo root by looking for package.json with workspaces
const logPath = getDevLogPath();
const logger = createLogger("cli", { logFilePath: logPath, logToFile: true, disableConsole: true });

interface ClaudeHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  reason?: string;
  stop_hook_active?: boolean;
  tool_name?: string;
  tool?: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
  command?: string;
  repo_path?: string;
  [key: string]: unknown;
}

export async function hookCommand(): Promise<void> {
  const startTime = Date.now();
  let eventName: string | undefined;
  let sessionId: string | undefined;

  try {
    // Read stdin
    const stdinPayload = await readStdin();

    // Log hook invocation with stdin size
    logger.info(`Hook invoked (stdin: ${stdinPayload.length} bytes)`);

    // Guard: empty stdin
    if (!stdinPayload.trim()) {
      logger.warn("Hook received empty stdin - ignoring");
      process.exit(0);
    }

    // Parse JSON
    let hookInput: ClaudeHookInput;
    try {
      hookInput = JSON.parse(stdinPayload) as ClaudeHookInput;
    } catch (error) {
      logger.error("Hook failed to parse stdin JSON", { error: error instanceof Error ? error.message : error });
      process.exit(1);
    }

    eventName = hookInput.hook_event_name;
    sessionId = hookInput.session_id || "unknown";

    // Guard: missing event name
    if (!eventName) {
      logger.error("Hook missing event name", { sessionId });
      process.exit(1);
    }

    // Log event details
    logger.info(`Hook: ${eventName} (session: ${sessionId.substring(0, 8)}...)`);

    // Process event
    if (eventName === "PreToolUse") {
      await handlePreToolUse(hookInput);
    } else if (eventName === "SessionEnd") {
      await handleSessionEnd(hookInput);
    } else if (eventName === "Stop") {
      await handleStop(hookInput);
    } else {
      logger.debug(`Hook: skipping unsupported event ${eventName}`);
    }

    // Log successful completion
    const duration = Date.now() - startTime;
    logger.info(`Hook completed: ${eventName} (${duration}ms)`, { sessionId: sessionId.substring(0, 8) });
    process.exit(0);
  } catch (error) {
    // Log error and exit with failure code
    const duration = Date.now() - startTime;
    logger.error(`Hook failed: ${eventName || "unknown"} (${duration}ms)`, {
      sessionId: sessionId?.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

async function handlePreToolUse(hookInput: ClaudeHookInput): Promise<void> {
  const sessionId = hookInput.session_id || "unknown";
  let shouldTrack = false;
  let modified = false;

  const { command, updateCommand } = extractCommand(hookInput);
  const toolName = typeof hookInput.tool_name === "string" ? hookInput.tool_name : hookInput.tool;
  const isBashTool = toolName ? toolName.toLowerCase() === "bash" : Boolean(command);

  if (isBashTool && command && containsGitCommit(command)) {
    shouldTrack = true;
    const prompts = await collectCommitPrompts({
      sessionId,
      transcriptPath: hookInput.transcript_path,
    });
    const updatedCommand = appendTranscriptLink(command, sessionId, prompts);
    if (updatedCommand !== command) {
      updateCommand(updatedCommand);
      modified = true;
    }
  }

  // Output the proper Claude Code hook response format
  // See: https://code.claude.com/docs/en/hooks (Advanced: JSON Output)
  // Must use hookSpecificOutput wrapper with permissionDecision (not decision)
  const output = modified
    ? {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          updatedInput: hookInput.tool_input,
        },
      }
    : {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
        },
      };
  process.stdout.write(JSON.stringify(output));

  if (shouldTrack) {
    await uploadPartialTranscript({
      sessionId,
      transcriptPath: hookInput.transcript_path,
      cwd: typeof hookInput.cwd === "string" ? hookInput.cwd : undefined,
    });
    await trackCommit({
      sessionId,
      repoPath: getRepoPath(hookInput),
      timestamp: new Date().toISOString(),
    });
  }

  logger.info("PreToolUse handled", {
    sessionId: sessionId.substring(0, 8),
    shouldTrack,
    modified,
  });
}

async function handleSessionEnd(hookInput: ClaudeHookInput): Promise<void> {
  const transcriptPath = hookInput.transcript_path;
  const sessionId = hookInput.session_id || "unknown";

  if (!transcriptPath) {
    logger.error("SessionEnd: missing transcript_path", { sessionId });
    return;
  }

  const config = readConfig();
  const serverUrl =
    process.env.VI_SERVER_URL ?? process.env.VIBEINSIGHTS_BASE_URL ?? config.baseURL ?? "http://localhost:3000";
  const authToken = getToken();

  if (!authToken) {
    logger.error("SessionEnd: no auth token found. Run the CLI login flow first.", { sessionId });
    return;
  }

  const options: UploadOptions = {};
  if (serverUrl) options.serverUrl = serverUrl;
  options.authToken = authToken;

  try {
    const result = await performUpload(
      {
        transcriptPath,
        sessionId: hookInput.session_id,
        cwdOverride: hookInput.cwd,
      },
      options,
    );

    if (result.success) {
      logger.info(`SessionEnd: uploaded ${result.eventCount} events`, {
        transcriptId: result.transcriptId,
        sessionId: sessionId.substring(0, 8),
      });
    } else {
      logger.error("SessionEnd: upload failed", { sessionId });
    }
  } catch (error) {
    logger.error("SessionEnd: upload error", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleStop(hookInput: ClaudeHookInput): Promise<void> {
  const transcriptPath = hookInput.transcript_path;
  const sessionId = hookInput.session_id || "unknown";

  if (!transcriptPath) {
    logger.error("Stop: missing transcript_path", { sessionId });
    return;
  }

  // Skip if stop_hook_active is true to avoid infinite loops
  if (hookInput.stop_hook_active) {
    logger.debug("Stop: skipped (stop_hook_active=true)", { sessionId });
    return;
  }

  const config = readConfig();
  const serverUrl =
    process.env.VI_SERVER_URL ?? process.env.VIBEINSIGHTS_BASE_URL ?? config.baseURL ?? "http://localhost:3000";
  const authToken = getToken();

  if (!authToken) {
    logger.error("Stop: no auth token found. Run the CLI login flow first.", { sessionId });
    return;
  }

  const options: UploadOptions = {};
  if (serverUrl) options.serverUrl = serverUrl;
  options.authToken = authToken;

  try {
    const result = await performUpload(
      {
        transcriptPath,
        sessionId: hookInput.session_id,
        cwdOverride: hookInput.cwd,
      },
      options,
    );

    if (result.success) {
      logger.info(`Stop: uploaded ${result.eventCount} events`, {
        transcriptId: result.transcriptId,
        sessionId: sessionId.substring(0, 8),
      });
    } else {
      logger.error("Stop: upload failed", { sessionId });
    }
  } catch (error) {
    logger.error("Stop: upload error", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", (error) => reject(error));
  });
}

// --- PreToolUse helper functions ---

export function extractCommand(hookInput: ClaudeHookInput): {
  command: string | undefined;
  updateCommand: (nextCommand: string) => void;
} {
  if (
    hookInput.tool_input &&
    typeof hookInput.tool_input === "object" &&
    typeof hookInput.tool_input.command === "string"
  ) {
    return {
      command: hookInput.tool_input.command,
      updateCommand: (nextCommand: string) => {
        if (hookInput.tool_input) {
          hookInput.tool_input.command = nextCommand;
        }
      },
    };
  }

  if (typeof hookInput.command === "string") {
    return {
      command: hookInput.command,
      updateCommand: (nextCommand: string) => {
        hookInput.command = nextCommand;
      },
    };
  }

  return {
    command: undefined,
    updateCommand: () => {},
  };
}

export function containsGitCommit(command: string): boolean {
  return /\bgit\s+commit\b/.test(command);
}

export function appendTranscriptLink(command: string, sessionId: string, prompts: string[] = []): string {
  const linkText = `🔮 View transcript: https://vibeinsights.dev/s/${sessionId}`;

  if (command.includes(linkText)) {
    return command;
  }

  const preparedPrompts = preparePromptList(prompts);
  const promptsSection = preparedPrompts.length
    ? `Prompts:\n${preparedPrompts.map((prompt) => `• "${prompt}"`).join("\n")}`
    : "";
  const suffix = promptsSection ? `\n\n${promptsSection}\n\n${linkText}` : `\n\n${linkText}`;

  // Patterns for different git commit message formats
  // Order matters: check equals-sign form first, then space-separated
  // Only match the FIRST occurrence to handle multiple -m flags
  const patterns = [
    // --message="msg" or --message='msg' (equals sign form)
    { regex: /(\s--message=)"([^"]*)"/, quote: '"', equalsForm: true },
    { regex: /(\s--message=)'([^']*)'/, quote: "'", equalsForm: true },
    // -m "msg", --message "msg", -am "msg" (space-separated form)
    { regex: /(\s(?:-m|--message|-am))\s+"([^"]*)"/, quote: '"', equalsForm: false },
    { regex: /(\s(?:-m|--message|-am))\s+'([^']*)'/, quote: "'", equalsForm: false },
  ];

  for (const { regex, quote, equalsForm } of patterns) {
    const match = command.match(regex);
    if (match) {
      const flag = match[1];
      const message = match[2];
      // Only replace the first match (handles multiple -m flags)
      if (equalsForm) {
        return command.replace(regex, `${flag}${quote}${message}${suffix}${quote}`);
      }
      return command.replace(regex, `${flag} ${quote}${message}${suffix}${quote}`);
    }
  }

  return command;
}

export function getRepoPath(hookInput: ClaudeHookInput): string {
  if (typeof hookInput.repo_path === "string") {
    return hookInput.repo_path;
  }

  if (typeof hookInput.cwd === "string") {
    return hookInput.cwd;
  }

  return "";
}

async function trackCommit(payload: { sessionId: string; repoPath: string; timestamp: string }): Promise<void> {
  const config = readConfig();
  const serverUrl =
    process.env.VI_SERVER_URL ?? process.env.VIBEINSIGHTS_BASE_URL ?? config.baseURL ?? "http://localhost:3000";

  const authToken = getToken();
  if (!authToken) {
    logger.warn("Commit tracking skipped: no auth token. Run 'vibeinsights login' first.", {
      sessionId: payload.sessionId.substring(0, 8),
    });
    return;
  }

  try {
    // 5 second timeout for commit tracking - fail silently if it takes too long
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(new URL("/api/commit-track", serverUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        session_id: payload.sessionId,
        repo_path: payload.repoPath,
        timestamp: payload.timestamp,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn("Commit tracking request failed", {
        sessionId: payload.sessionId.substring(0, 8),
        status: response.status,
      });
      return;
    }

    logger.info("Commit tracking recorded", {
      sessionId: payload.sessionId.substring(0, 8),
      repoPath: payload.repoPath,
    });
  } catch (error) {
    // Check if it was a timeout (AbortError)
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn("Commit tracking request timed out after 5s", {
        sessionId: payload.sessionId.substring(0, 8),
      });
      return;
    }
    logger.error("Commit tracking request error", {
      sessionId: payload.sessionId.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function uploadPartialTranscript(payload: {
  sessionId: string;
  transcriptPath?: string;
  cwd?: string;
}): Promise<void> {
  if (!payload.transcriptPath) {
    logger.warn("Commit tracking transcript upload skipped: missing transcript_path", {
      sessionId: payload.sessionId.substring(0, 8),
    });
    return;
  }

  const config = readConfig();
  const serverUrl =
    process.env.VI_SERVER_URL ?? process.env.VIBEINSIGHTS_BASE_URL ?? config.baseURL ?? "http://localhost:3000";

  const authToken = getToken();
  if (!authToken) {
    logger.warn("Commit tracking transcript upload skipped: no auth token. Run 'vibeinsights login' first.", {
      sessionId: payload.sessionId.substring(0, 8),
    });
    return;
  }

  const options: UploadOptions = {};
  if (serverUrl) options.serverUrl = serverUrl;
  options.authToken = authToken;

  try {
    const result = await performUpload(
      {
        transcriptPath: payload.transcriptPath,
        sessionId: payload.sessionId,
        cwdOverride: payload.cwd,
      },
      options,
    );

    if (result.success) {
      logger.info("Commit tracking: uploaded partial transcript", {
        transcriptId: result.transcriptId,
        sessionId: payload.sessionId.substring(0, 8),
        eventCount: result.eventCount,
      });
    } else {
      logger.error("Commit tracking: transcript upload failed", {
        sessionId: payload.sessionId.substring(0, 8),
      });
    }
  } catch (error) {
    logger.error("Commit tracking: transcript upload error", {
      sessionId: payload.sessionId.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function collectCommitPrompts(payload: { sessionId: string; transcriptPath?: string }): Promise<string[]> {
  if (!payload.transcriptPath) {
    logger.warn("Commit prompts skipped: missing transcript_path", {
      sessionId: payload.sessionId.substring(0, 8),
    });
    return [];
  }

  const entries = await readTranscriptEntries(payload.transcriptPath, payload.sessionId);
  if (entries.length === 0) {
    return [];
  }

  // Use the shared transcript parser which properly filters out tool results from user messages
  const transcript = convertClaudeCodeTranscript(entries);
  if (!transcript || transcript.messages.length === 0) {
    return [];
  }

  return getPromptsSinceLastCommit(transcript.messages);
}

async function readTranscriptEntries(transcriptPath: string, sessionId: string): Promise<TranscriptEntry[]> {
  try {
    const rawContent = await fs.readFile(transcriptPath, "utf8");
    const lines = rawContent.split(/\r?\n/);
    const entries: TranscriptEntry[] = [];
    let invalidLines = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      try {
        const parsed = JSON.parse(line) as unknown;
        if (!isRecord(parsed)) {
          invalidLines += 1;
          continue;
        }

        if (typeof parsed.type !== "string") {
          continue;
        }

        entries.push(parsed as TranscriptEntry);
      } catch {
        invalidLines += 1;
      }
    }

    if (invalidLines > 0) {
      logger.warn("Commit prompts: skipped invalid transcript lines", {
        sessionId: sessionId.substring(0, 8),
        invalidLines,
      });
    }

    return entries;
  } catch (error) {
    logger.warn("Commit prompts skipped: unable to read transcript", {
      sessionId: sessionId.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function findLastGitCommitIndex(messages: UnifiedTranscriptMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type !== "tool-call") {
      continue;
    }

    const toolName = message.toolName;
    if (!toolName || toolName.toLowerCase() !== "bash") {
      continue;
    }

    const command = extractToolCommand(message.input);
    if (command && containsGitCommit(command)) {
      return index;
    }
  }

  return -1;
}

export function getPromptsSinceLastCommit(messages: UnifiedTranscriptMessage[]): string[] {
  const startIndex = findLastGitCommitIndex(messages);
  const prompts: string[] = [];
  const start = startIndex >= 0 ? startIndex + 1 : 0;

  for (let index = start; index < messages.length; index += 1) {
    const message = messages[index];
    // The unified transcript already filters user messages to exclude tool results
    if (message.type !== "user") {
      continue;
    }
    // User messages in unified transcript have text directly available
    if (message.text) {
      prompts.push(message.text);
    }
  }

  return prompts;
}

function extractToolCommand(input: unknown): string | null {
  if (!isRecord(input)) {
    return null;
  }

  const directCommand = input.command;
  if (typeof directCommand === "string") {
    return directCommand;
  }

  if (Array.isArray(directCommand)) {
    const commandEntry = directCommand[2];
    if (typeof commandEntry === "string") {
      return commandEntry;
    }
    const joined = directCommand.filter((part) => typeof part === "string").join(" ");
    return joined.length > 0 ? joined : null;
  }

  const fallbackCommand = input.cmd;
  if (typeof fallbackCommand === "string") {
    return fallbackCommand;
  }

  return null;
}

export function escapeShellChars(text: string): string {
  // Escape characters that could break shell parsing when embedded in a quoted string
  // Backticks, $, and backslashes are the main culprits
  return text.replace(/[`$\\]/g, "\\$&");
}

function preparePromptList(prompts: string[]): string[] {
  const normalized = prompts.map((prompt) => prompt.replace(/\s+/g, " ").trim()).filter((prompt) => prompt.length > 0);

  const recent = normalized.length > 5 ? normalized.slice(-5) : normalized;

  return recent.map((prompt) => escapeShellChars(truncatePrompt(prompt, 60)));
}

function truncatePrompt(prompt: string, maxLength: number): string {
  if (prompt.length <= maxLength) {
    return prompt;
  }

  if (maxLength <= 3) {
    return "...".slice(0, maxLength);
  }

  return `${prompt.slice(0, maxLength - 3)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface TranscriptEntry extends Record<string, unknown> {
  type: string;
  toolName?: unknown;
  input?: unknown;
}
