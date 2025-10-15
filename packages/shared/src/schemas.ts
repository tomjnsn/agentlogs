import { z } from "zod";

// Transcript Event Schemas

const baseEventSchema = z.object({
  sessionId: z.string(),
  uuid: z.string(),
  timestamp: z.string(),
});

// Content block schema for structured messages (tool results, etc.)
const contentBlockSchema = z
  .object({
    type: z.string(),
    // Additional fields vary by type, so we use passthrough to allow them
  })
  .passthrough();

const userEventSchema = baseEventSchema.extend({
  type: z.literal("user"),
  message: z.object({
    role: z.literal("user"),
    // Content can be string (simple message) or array (tool result with content blocks)
    content: z.union([z.string(), z.array(contentBlockSchema)]),
  }),
  cwd: z.string(),
  gitBranch: z.string().optional(),
  version: z.string().optional(),
  userType: z.string().optional(),
  parentUuid: z.string().nullable(),
  isSidechain: z.boolean().optional(),
});

const assistantEventSchema = baseEventSchema.extend({
  type: z.literal("assistant"),
  message: z.object({
    role: z.literal("assistant"),
    content: z.array(
      z
        .object({
          type: z.string(),
          text: z.string().optional(),
        })
        .passthrough(),
    ),
  }),
});

const toolUseEventSchema = baseEventSchema.extend({
  type: z.literal("tool_use"),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
});

const toolResultEventSchema = baseEventSchema.extend({
  type: z.literal("tool_result"),
  tool_name: z.string(),
  tool_response: z.record(z.unknown()),
  success: z.boolean().optional(),
  error: z.string().optional(),
});

// Catch-all for other event types (like file-history-snapshot, etc.)
// We accept these but don't strictly validate their structure
const fileHistorySnapshotSchema = baseEventSchema
  .extend({
    type: z.literal("file-history-snapshot"),
  })
  .passthrough();

export const transcriptEventSchema = z.discriminatedUnion("type", [
  userEventSchema,
  assistantEventSchema,
  toolUseEventSchema,
  toolResultEventSchema,
  fileHistorySnapshotSchema,
]);

// API Payload Schemas

export const uploadPayloadSchema = z.object({
  repoId: z.string(),
  repoName: z.string(),
  sessionId: z.string(),
  events: z.array(transcriptEventSchema),
  metadata: z
    .object({
      cwd: z.string(),
      reason: z.string(),
      eventCount: z.number(),
    })
    .optional(),
});

export const uploadResponseSchema = z.object({
  success: z.boolean(),
  transcriptId: z.string(),
  eventsReceived: z.number(),
});

// Unified Transcript Schemas

const userMessageSchema = z.object({
  type: z.literal("user"),
  text: z.string(),
  id: z.string().optional(),
  timestamp: z.string().optional(),
});

const agentMessageSchema = z.object({
  type: z.literal("agent"),
  text: z.string(),
  id: z.string().optional(),
  timestamp: z.string().optional(),
  model: z.string().optional(),
});

const thinkingMessageSchema = z.object({
  type: z.literal("thinking"),
  text: z.string(),
  id: z.string().optional(),
  timestamp: z.string().optional(),
  model: z.string().optional(),
});

const toolCallMessageSchema = z.object({
  type: z.literal("tool-call"),
  toolName: z.string().nullable(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  id: z.string().optional(),
  timestamp: z.string().optional(),
  model: z.string().optional(),
});

export const unifiedTranscriptMessageSchema = z.discriminatedUnion("type", [
  userMessageSchema,
  agentMessageSchema,
  thinkingMessageSchema,
  toolCallMessageSchema,
]);

export const unifiedTokenUsageSchema = z.object({
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
  totalTokens: z.number(),
});

export const unifiedModelUsageSchema = z.object({
  model: z.string(),
  usage: unifiedTokenUsageSchema,
});

export const unifiedGitContextSchema = z
  .object({
    relativeCwd: z.string().nullable(),
    branch: z.string().nullable(),
    repo: z.string().nullable(),
  })
  .strict()
  .nullable();

export const unifiedTranscriptSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  source: z.enum(["claude-code", "unknown"]),
  timestamp: z.date(),
  preview: z.string().nullable(),
  model: z.string().nullable(),
  blendedTokens: z.number(),
  costUsd: z.number(),
  messageCount: z.number(),
  tokenUsage: unifiedTokenUsageSchema,
  modelUsage: z.array(unifiedModelUsageSchema),
  git: unifiedGitContextSchema,
  messages: z.array(unifiedTranscriptMessageSchema),
});
