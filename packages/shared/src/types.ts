// Transcript Event Types

export interface BaseTranscriptEvent {
  sessionId: string;
  uuid: string;
  timestamp: string;
}

export interface UserMessageEvent extends BaseTranscriptEvent {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
  cwd: string;
  gitBranch?: string;
  version?: string;
  userType?: string;
  parentUuid: string | null;
  isSidechain?: boolean;
}

export interface AssistantMessageEvent extends BaseTranscriptEvent {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{
      type: string;
      text?: string;
      [key: string]: unknown;
    }>;
  };
}

export interface ToolUseEvent extends BaseTranscriptEvent {
  type: 'tool_use';
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ToolResultEvent extends BaseTranscriptEvent {
  type: 'tool_result';
  tool_name: string;
  tool_response: Record<string, unknown>;
  success?: boolean;
  error?: string;
}

export type TranscriptEvent =
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolUseEvent
  | ToolResultEvent;

// API Payloads

export interface UploadPayload {
  repoId: string;
  repoName: string;
  sessionId: string;
  events: TranscriptEvent[];
  metadata: {
    cwd: string;
    reason: string;
    eventCount: number;
  };
}

export interface UploadResponse {
  success: boolean;
  transcriptId: string;
  eventsReceived: number;
}

// Database Models
// NOTE: Raw database models are now defined in packages/server/src/db/schema.ts
// These types are kept for backward compatibility with the web UI
// TODO: Web UI should import from Drizzle schema exports instead

export interface Repo {
  id: string;
  name: string;
  url: string;
  transcriptCount: number;
  lastActivity: string | null;
  userId: string;
  createdAt: Date;
}

export interface Transcript {
  id: string;
  repoId: string;
  sessionId: string | null;
  events: string; // JSON
  createdAt: Date;
  analyzed: boolean;
  userId: string;
}

export interface Analysis {
  transcriptId: string;
  retryCount: number;
  errorCount: number;
  toolFailureRate: number;
  contextOverflows: number;
  healthScore: number;
  antiPatterns: string; // JSON array
  recommendations: string; // JSON array
  analyzedAt: Date;
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
    severity: 'low' | 'medium' | 'high';
  }>;
  recommendations: string[];
  healthScore: number;
}

// UI View Models

export interface RepoView {
  id: string;
  name: string;
  transcriptCount: number;
  avgHealthScore: number | null;
  lastActivity: string;
}

export interface TranscriptView {
  id: string;
  sessionId: string;
  eventCount: number;
  createdAt: string;
  healthScore: number | null;
}
