// API Payloads

import type { UnifiedTranscript } from "./claudecode";

export type TranscriptSource = "claude-code" | "codex";

export interface UploadPayload {
  sha256: string;
  rawTranscript: string;
  unifiedTranscript: UnifiedTranscript;
}

export interface UploadResponse {
  success: boolean;
  transcriptId: string;
  eventsReceived: number;
}

export interface TranscriptMetadata {
  transcriptId: string;
  sha256: string;
  repoId: string | null;
}
