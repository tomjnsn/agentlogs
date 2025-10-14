import type { UploadOptions } from "@vibeinsights/shared/upload";
import { performUpload } from "../lib/perform-upload";
import { getToken, readConfig } from "../config";

interface ClaudeHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  reason?: string;
  stop_hook_active?: boolean;
  [key: string]: unknown;
}

const SESSION_END_REASON_FALLBACK = "claude-session-end";
const STOP_REASON_FALLBACK = "claude-stop";

export async function hookCommand(_args: string[] = []): Promise<void> {
  const stdinPayload = await readStdin();

  if (!stdinPayload.trim()) {
    console.error("No hook input received on stdin. Exiting.");
    return;
  }

  let hookInput: ClaudeHookInput;

  try {
    hookInput = JSON.parse(stdinPayload) as ClaudeHookInput;
  } catch (error) {
    console.error("Failed to parse hook input as JSON:", error instanceof Error ? error.message : error);
    return;
  }

  const eventName = hookInput.hook_event_name;

  if (!eventName) {
    console.error("Hook input did not include hook_event_name.");
    return;
  }

  if (eventName === "SessionEnd") {
    await handleSessionEnd(hookInput);
  } else if (eventName === "Stop") {
    await handleStop(hookInput);
  } else {
    console.log(`Skipping unsupported hook event "${eventName}".`);
  }
}

async function handleSessionEnd(hookInput: ClaudeHookInput): Promise<void> {
  const transcriptPath = hookInput.transcript_path;

  if (!transcriptPath) {
    console.error("SessionEnd hook did not provide transcript_path.");
    return;
  }

  const config = readConfig();
  const serverUrl =
    process.env.VI_SERVER_URL ??
    process.env.VIBEINSIGHTS_BASE_URL ??
    config.baseURL ??
    "http://localhost:3000";
  const apiToken = process.env.VI_API_TOKEN ?? getToken() ?? undefined;

  const options: UploadOptions = {};
  if (serverUrl) {
    options.serverUrl = serverUrl;
  }
  if (apiToken) {
    options.apiToken = apiToken;
  }

  try {
    console.log("↻ Uploading transcript from Claude Code hook…");
    const result = await performUpload(
      {
        transcriptPath,
        reason: hookInput.reason ?? SESSION_END_REASON_FALLBACK,
        sessionId: hookInput.session_id,
        cwdOverride: hookInput.cwd,
      },
      options,
    );

    if (result.success) {
      console.log(
        `✓ Upload successful (${result.eventCount} events${
          result.transcriptId ? `, transcript ID: ${result.transcriptId}` : ""
        })`,
      );
    } else {
      console.error("✗ Failed to upload transcript to Vibe Insights server.");
    }
  } catch (error) {
    console.error("✗ Hook upload error:", error instanceof Error ? error.message : error);
  }
}

async function handleStop(hookInput: ClaudeHookInput): Promise<void> {
  const transcriptPath = hookInput.transcript_path;

  if (!transcriptPath) {
    console.error("Stop hook did not provide transcript_path.");
    return;
  }

  // Skip if stop_hook_active is true to avoid infinite loops
  if (hookInput.stop_hook_active) {
    console.log("Skipping Stop hook (stop_hook_active is true).");
    return;
  }

  const config = readConfig();
  const serverUrl =
    process.env.VI_SERVER_URL ??
    process.env.VIBEINSIGHTS_BASE_URL ??
    config.baseURL ??
    "http://localhost:3000";
  const apiToken = process.env.VI_API_TOKEN ?? getToken() ?? undefined;

  const options: UploadOptions = {};
  if (serverUrl) {
    options.serverUrl = serverUrl;
  }
  if (apiToken) {
    options.apiToken = apiToken;
  }

  try {
    console.log("↻ Uploading transcript from Claude Code Stop hook…");
    const result = await performUpload(
      {
        transcriptPath,
        reason: hookInput.reason ?? STOP_REASON_FALLBACK,
        sessionId: hookInput.session_id,
        cwdOverride: hookInput.cwd,
      },
      options,
    );

    if (result.success) {
      console.log(
        `✓ Upload successful (${result.eventCount} events${
          result.transcriptId ? `, transcript ID: ${result.transcriptId}` : ""
        })`,
      );
    } else {
      console.error("✗ Failed to upload transcript to Vibe Insights server.");
    }
  } catch (error) {
    console.error("✗ Hook upload error:", error instanceof Error ? error.message : error);
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
