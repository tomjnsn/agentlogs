import { promises as fs } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "@vibeinsights/shared/logger";
import type { UploadOptions } from "@vibeinsights/shared/upload";
import { getToken, readConfig } from "../config";
import { performUpload } from "../lib/perform-upload";

// Create logger for CLI hook commands with explicit log path
// Use the file's location to find the monorepo root, not the working directory
// File location: /agentic-engineering-insights/packages/cli/src/commands/pretool-hook.ts
// Target: /agentic-engineering-insights/logs/dev.log
// Relative path: ../../../../logs/dev.log
function getDevLogPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, "../../../../logs/dev.log");
}

const logPath = getDevLogPath();
const logger = createLogger("cli", { logFilePath: logPath, logToFile: true, disableConsole: true });

interface PreToolHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
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

export async function pretoolHookCommand(): Promise<void> {
  const startTime = Date.now();
  let sessionId = "unknown";
  let eventName: string | undefined;
  let shouldTrack = false;
  let modified = false;

  try {
    const stdinPayload = await readStdin();
    logger.info(`Pretool hook invoked (stdin: ${stdinPayload.length} bytes)`);

    if (!stdinPayload.trim()) {
      logger.warn("Pretool hook received empty stdin - ignoring");
      process.exit(0);
    }

    let hookInput: PreToolHookInput;
    try {
      hookInput = JSON.parse(stdinPayload) as PreToolHookInput;
    } catch (error) {
      logger.error("Pretool hook failed to parse stdin JSON", {
        error: error instanceof Error ? error.message : error,
      });
      process.exit(1);
    }

    sessionId = typeof hookInput.session_id === "string" ? hookInput.session_id : "unknown";
    eventName = typeof hookInput.hook_event_name === "string" ? hookInput.hook_event_name : undefined;

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

    const duration = Date.now() - startTime;
    logger.info(`Pretool hook completed (${duration}ms)`, {
      sessionId: sessionId.substring(0, 8),
      eventName,
      shouldTrack,
      modified,
    });
    process.exit(0);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Pretool hook failed (${duration}ms)`, {
      sessionId: sessionId.substring(0, 8),
      eventName,
      shouldTrack,
      modified,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

export function extractCommand(hookInput: PreToolHookInput): {
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

export function getRepoPath(hookInput: PreToolHookInput): string {
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

  return getPromptsSinceLastCommit(entries);
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

export function findLastGitCommitIndex(entries: TranscriptEntry[]): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== "tool-call") {
      continue;
    }

    const toolName = typeof entry.toolName === "string" ? entry.toolName : null;
    if (!toolName || toolName.toLowerCase() !== "bash") {
      continue;
    }

    const command = extractToolCommand(entry.input);
    if (command && containsGitCommit(command)) {
      return index;
    }
  }

  return -1;
}

export function getPromptsSinceLastCommit(entries: TranscriptEntry[]): string[] {
  const startIndex = findLastGitCommitIndex(entries);
  const prompts: string[] = [];
  const start = startIndex >= 0 ? startIndex + 1 : 0;

  for (let index = start; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.type !== "user") {
      continue;
    }
    const prompt = extractPromptText(entry);
    if (prompt) {
      prompts.push(prompt);
    }
  }

  return prompts;
}

function extractPromptText(record: Record<string, unknown>): string | null {
  if (typeof record.text === "string") {
    return record.text;
  }

  const message = record.message;
  const messageContent = extractContentText(message);
  if (messageContent) {
    return messageContent;
  }

  const directContent = extractContentText(record.content);
  if (directContent) {
    return directContent;
  }

  return null;
}

function extractContentText(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (isRecord(content)) {
    const innerContent = extractContentText(content.content);
    if (innerContent) {
      return innerContent;
    }
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item)) {
          const text = extractContentText(item.text ?? item.content);
          return text ?? "";
        }
        return "";
      })
      .filter((part) => part.length > 0);

    if (parts.length > 0) {
      return parts.join("");
    }
  }

  return null;
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

function preparePromptList(prompts: string[]): string[] {
  const normalized = prompts.map((prompt) => prompt.replace(/\s+/g, " ").trim()).filter((prompt) => prompt.length > 0);

  const recent = normalized.length > 5 ? normalized.slice(-5) : normalized;

  return recent.map((prompt) => truncatePrompt(prompt, 60));
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
