// API Payloads

export type TranscriptSource = "claude-code" | "codex";

export interface UploadPayload {
  repoId: string;
  transcriptId: string;
  sha256: string;
  rawTranscript: string;
  source: TranscriptSource;
}

export interface UploadResponse {
  success: boolean;
  transcriptId: string;
  eventsReceived: number;
}

export interface TranscriptMetadata {
  transcriptId: string;
  sha256: string;
  repoId: string;
}

// Analysis Results

export interface AnalysisResult {
  transcriptId: string;
  metrics: {
    totalEvents: number;
    toolCalls: number;
    errors: number;
    retries: number;
    contextOverflows: number;
    duration: number;
  };
  antiPatterns: Array<{
    type: string;
    description: string;
    severity: "low" | "medium" | "high";
  }>;
  recommendations: string[];
  healthScore: number;
}
