import type { UploadOptions } from "@vibeinsights/shared/upload";
import { getToken } from "../config";
import { performUpload, resolveTranscriptPath } from "../lib/perform-upload";

const MANUAL_UPLOAD_REASON = "manual-cli-upload";

export async function uploadCommand(args: string[]): Promise<void> {
  const [transcriptArg] = args;

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
  const apiToken = process.env.VI_API_TOKEN ?? getToken() ?? undefined;

  const options: UploadOptions = {};
  if (serverUrl) {
    options.serverUrl = serverUrl;
  }
  if (apiToken) {
    options.apiToken = apiToken;
  }

  try {
    console.log(`Uploading events from ${transcriptPath} to Vibe Insights...`);
    const result = await performUpload(
      {
        transcriptPath,
        reason: MANUAL_UPLOAD_REASON,
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

    console.error("✗ Failed to upload transcript to Vibe Insights server.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unexpected error occurred while uploading transcript.");
  }
  process.exit(1);
}
