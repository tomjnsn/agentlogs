import type { TranscriptSource } from "@agentlogs/shared";
import type { UploadOptions } from "@agentlogs/shared/upload";
import { getToken } from "../config";
import { performUpload, resolveTranscriptPath } from "../lib/perform-upload";

export async function uploadCommand(transcriptArg: string, source: TranscriptSource = "claude-code"): Promise<void> {
  if (!transcriptArg) {
    console.error("The upload command expects a <transcript> argument.");
    process.exit(1);
  }

  const transcriptPath = resolveTranscriptPath(transcriptArg);

  if (!transcriptPath) {
    console.error(`Transcript file not found for path: ${transcriptArg}`);
    process.exit(1);
  }

  const serverUrl = process.env.SERVER_URL ?? "http://localhost:3000";
  const authToken = getToken();

  if (!authToken) {
    console.error("You must be logged in to upload transcripts. Run `bun run src/index.ts login` first.");
    process.exit(1);
  }

  const options: UploadOptions = {};
  if (serverUrl) {
    options.serverUrl = serverUrl;
  }
  options.authToken = authToken;

  try {
    const sourceLabel = source === "codex" ? "Codex" : "Claude Code";
    console.log(`Uploading ${sourceLabel} transcript events from ${transcriptPath} to AgentLogs...`);
    const result = await performUpload(
      {
        transcriptPath,
        source,
      },
      options,
    );

    if (result.success) {
      console.log(
        `✓ Upload successful (${result.eventCount} events${
          result.transcriptId ? `, transcript ID: ${result.transcriptId}` : ""
        })`,
      );
      return;
    }

    console.error("✗ Failed to upload transcript to AgentLogs server.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unexpected error occurred while uploading transcript.");
  }
  process.exit(1);
}
