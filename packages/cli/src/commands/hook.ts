import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "@vibeinsights/shared/logger";
import type { UploadOptions } from "@vibeinsights/shared/upload";
import { getToken, readConfig } from "../config";
import { performUpload } from "../lib/perform-upload";

// Create logger for CLI hook commands with explicit log path
// Use the file's location to find the monorepo root, not the working directory
// File location: /agentic-engineering-insights/packages/cli/src/commands/hook.ts
// Target: /agentic-engineering-insights/logs/dev.log
// Relative path: ../../../../logs/dev.log
function getDevLogPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, "../../../../logs/dev.log");
}

const logPath = getDevLogPath();
const logger = createLogger("cli", { logFilePath: logPath, logToFile: true });

interface ClaudeHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  reason?: string;
  stop_hook_active?: boolean;
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
    if (eventName === "SessionEnd") {
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
