import type { TranscriptMetadata } from "./types";

const DEFAULT_SERVER_URL = "http://localhost:3000";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchTranscriptMetadataOptions {
  serverUrl?: string;
  authToken?: string;
  timeoutMs?: number;
}

export async function fetchTranscriptMetadata(
  options: FetchTranscriptMetadataOptions = {},
): Promise<TranscriptMetadata[]> {
  const serverUrl = options.serverUrl ?? process.env.VI_SERVER_URL ?? DEFAULT_SERVER_URL;
  const authToken = options.authToken ?? null;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const response = await fetch(`${serverUrl}/api/transcripts`, {
      method: "GET",
      headers: {
        ...(authToken && {
          Authorization: `Bearer ${authToken}`,
        }),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      console.error(`Failed to fetch transcript metadata: ${response.status} ${response.statusText}`);
      return [];
    }

    const payload = (await response.json()) as unknown;

    if (isTranscriptMetadataResponse(payload)) {
      return payload.transcripts;
    }

    console.error("Transcript metadata response had unexpected shape:", payload);
    return [];
  } catch (error) {
    if (error instanceof Error) {
      console.error("Failed to fetch transcript metadata:", error.message);
    }
    return [];
  }
}

function isTranscriptMetadataResponse(payload: unknown): payload is { transcripts: TranscriptMetadata[] } {
  if (typeof payload !== "object" || payload === null || !("transcripts" in payload)) {
    return false;
  }

  const { transcripts } = payload as { transcripts: unknown };

  if (!Array.isArray(transcripts)) {
    return false;
  }

  return transcripts.every((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const record = item as Partial<TranscriptMetadata>;

    return (
      typeof record.transcriptId === "string" &&
      record.transcriptId.length > 0 &&
      typeof record.sha256 === "string" &&
      record.sha256.length > 0 &&
      typeof record.repoId === "string" &&
      record.repoId.length > 0
    );
  });
}
