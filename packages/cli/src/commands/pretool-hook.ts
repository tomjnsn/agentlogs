import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "@vibeinsights/shared/logger";
import { getToken, readConfig } from "../config";

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
      const updatedCommand = appendTranscriptLink(command, sessionId);
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

export function appendTranscriptLink(command: string, sessionId: string): string {
  const linkText = `🔮 View transcript: https://vibeinsights.dev/s/${sessionId}`;

  if (command.includes(linkText)) {
    return command;
  }

  const suffix = `\n\n${linkText}`;

  const patterns = [
    { regex: /(\s(?:-m|--message|-am))\s+"([^"]*)"/, quote: '"' },
    { regex: /(\s(?:-m|--message|-am))\s+'([^']*)'/, quote: "'" },
  ];

  for (const { regex, quote } of patterns) {
    const match = command.match(regex);
    if (match) {
      const flag = match[1];
      const message = match[2];
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
    });

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
    logger.error("Commit tracking request error", {
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
