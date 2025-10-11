import { z } from 'zod';

// Transcript Event Schemas

const baseEventSchema = z.object({
  sessionId: z.string(),
  uuid: z.string(),
  timestamp: z.string(),
});

const userEventSchema = baseEventSchema.extend({
  type: z.literal('user'),
  message: z.object({
    role: z.literal('user'),
    content: z.string(),
  }),
  cwd: z.string(),
  gitBranch: z.string().optional(),
  version: z.string().optional(),
  userType: z.string().optional(),
  parentUuid: z.string().nullable(),
  isSidechain: z.boolean().optional(),
});

const assistantEventSchema = baseEventSchema.extend({
  type: z.literal('assistant'),
  message: z.object({
    role: z.literal('assistant'),
    content: z.array(z.object({
      type: z.string(),
      text: z.string().optional(),
    }).passthrough()),
  }),
});

const toolUseEventSchema = baseEventSchema.extend({
  type: z.literal('tool_use'),
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
});

const toolResultEventSchema = baseEventSchema.extend({
  type: z.literal('tool_result'),
  tool_name: z.string(),
  tool_response: z.record(z.unknown()),
  success: z.boolean().optional(),
  error: z.string().optional(),
});

export const transcriptEventSchema = z.discriminatedUnion('type', [
  userEventSchema,
  assistantEventSchema,
  toolUseEventSchema,
  toolResultEventSchema,
]);

// API Payload Schemas

export const uploadPayloadSchema = z.object({
  repoId: z.string(),
  repoName: z.string(),
  sessionId: z.string(),
  events: z.array(transcriptEventSchema),
  metadata: z.object({
    cwd: z.string(),
    reason: z.string(),
    eventCount: z.number(),
  }).optional(),
});

export const uploadResponseSchema = z.object({
  success: z.boolean(),
  transcriptId: z.string(),
  eventsReceived: z.number(),
});
