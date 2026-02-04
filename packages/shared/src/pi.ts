import crypto from "node:crypto";
import fs from "node:fs/promises";
import {
  calculateTranscriptStats,
  type ConversionResult,
  type TranscriptBlob,
  type UnifiedGitContext,
  type UnifiedTokenUsage,
  type UnifiedTranscript,
  type UnifiedTranscriptMessage,
} from "./claudecode";
import { formatCwdWithTilde, relativizePaths } from "./paths";
import type { LiteLLMModelPricing } from "./pricing";
import { unifiedModelUsageSchema, unifiedTranscriptMessageSchema, unifiedTranscriptSchema } from "./schemas";

// ============================================================================
// Pi Session Types
// ============================================================================

export type PiSessionHeader = {
  type: "session";
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
};

export type PiSessionEntryBase = {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
};

export type PiMessageEntry = PiSessionEntryBase & {
  type: "message";
  message: PiAgentMessage;
};

export type PiModelChangeEntry = PiSessionEntryBase & {
  type: "model_change";
  provider: string;
  modelId: string;
};

export type PiThinkingLevelChangeEntry = PiSessionEntryBase & {
  type: "thinking_level_change";
  thinkingLevel: string;
};

export type PiCompactionEntry = PiSessionEntryBase & {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
};

export type PiBranchSummaryEntry = PiSessionEntryBase & {
  type: "branch_summary";
  fromId: string;
  summary: string;
  details?: unknown;
};

export type PiCustomEntry = PiSessionEntryBase & {
  type: "custom";
  customType: string;
  data?: unknown;
};

export type PiCustomMessageEntry = PiSessionEntryBase & {
  type: "custom_message";
  customType: string;
  content: string | PiContentBlock[];
  display: boolean;
  details?: unknown;
};

export type PiLabelEntry = PiSessionEntryBase & {
  type: "label";
  targetId: string;
  label?: string;
};

export type PiSessionInfoEntry = PiSessionEntryBase & {
  type: "session_info";
  name?: string;
};

export type PiSessionEntry =
  | PiMessageEntry
  | PiModelChangeEntry
  | PiThinkingLevelChangeEntry
  | PiCompactionEntry
  | PiBranchSummaryEntry
  | PiCustomEntry
  | PiCustomMessageEntry
  | PiLabelEntry
  | PiSessionInfoEntry;

// ============================================================================
// Pi Message Types
// ============================================================================

export type PiTextContent = {
  type: "text";
  text: string;
};

export type PiImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type PiThinkingContent = {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
};

export type PiToolCall = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type PiContentBlock = PiTextContent | PiImageContent | PiThinkingContent | PiToolCall;

export type PiUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
};

export type PiUserMessage = {
  role: "user";
  content: string | PiContentBlock[];
  timestamp: number;
};

export type PiAssistantMessage = {
  role: "assistant";
  content: PiContentBlock[];
  api: string;
  provider: string;
  model: string;
  usage: PiUsage;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
};

export type PiToolResultMessage = {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: PiContentBlock[];
  details?: unknown;
  isError: boolean;
  timestamp: number;
};

export type PiBashExecutionMessage = {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp: number;
};

export type PiCompactionSummaryMessage = {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
};

export type PiBranchSummaryMessage = {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp: number;
};

export type PiCustomMessage = {
  role: "custom";
  customType: string;
  content: string | PiContentBlock[];
  display: boolean;
  details?: unknown;
  timestamp: number;
};

export type PiAgentMessage =
  | PiUserMessage
  | PiAssistantMessage
  | PiToolResultMessage
  | PiBashExecutionMessage
  | PiCompactionSummaryMessage
  | PiBranchSummaryMessage
  | PiCustomMessage;

// ============================================================================
// Conversion Options
// ============================================================================

export type ConvertPiOptions = {
  now?: Date;
  gitContext?: UnifiedGitContext | null;
  pricing?: Record<string, LiteLLMModelPricing>;
  clientVersion?: string;
  /** Override the leaf ID (useful when called from extension with known leaf) */
  leafId?: string;
  /** Override the working directory for path relativization */
  cwd?: string;
};

// ============================================================================
// Tool Name Mapping
// ============================================================================

const TOOL_NAME_MAP: Record<string, string> = {
  read: "Read",
  write: "Write",
  edit: "Edit",
  bash: "Bash",
  grep: "Grep",
  find: "Glob",
  ls: "Ls",
};

// ============================================================================
// Main Converter
// ============================================================================

/**
 * Convert a Pi session from JSONL file to unified transcript.
 */
export async function convertPiFile(
  filePath: string,
  options: ConvertPiOptions = {},
): Promise<ConversionResult | null> {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) {
    return null;
  }

  const header = JSON.parse(lines[0]) as PiSessionHeader;
  const entries: PiSessionEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]) as PiSessionEntry;
      entries.push(entry);
    } catch {
      // Skip malformed lines
    }
  }

  return convertPiTranscript({ header, entries }, options);
}

/**
 * Convert a Pi session from in-memory data to unified transcript.
 */
export function convertPiTranscript(
  session: { header: PiSessionHeader; entries: PiSessionEntry[] },
  options: ConvertPiOptions = {},
): ConversionResult | null {
  const { header, entries } = session;

  if (entries.length === 0) {
    return null;
  }

  // Find the leaf (entry with no children)
  const leafId = options.leafId ?? findLeafId(entries);
  if (!leafId) {
    return null;
  }

  // Build the linear branch from leaf to root
  const branch = buildLinearBranch(entries, leafId);
  if (branch.length === 0) {
    return null;
  }

  // Get branch anchor for transcript ID
  const branchAnchorId = getBranchAnchorId(entries, leafId);
  const transcriptId = branchAnchorId ? `${header.id}-${branchAnchorId}` : header.id;

  // Convert entries to unified messages
  const effectiveCwd = options.cwd ?? header.cwd;
  const { messages, blobs, tokenUsage, modelUsageMap, primaryModel, cwd } = convertEntriesToMessages(
    branch,
    effectiveCwd,
  );

  if (messages.length === 0) {
    return null;
  }

  // Derive preview from first user message
  const preview = derivePreview(messages);
  const timestamp = parseDate(header.timestamp) ?? options.now ?? new Date();
  const blendedTokens = blendedTokenTotal(tokenUsage);
  const costUsd = tokenUsage.cost ?? calculateCostFromUsage(primaryModel, tokenUsage, options.pricing);

  const gitContext = options.gitContext !== undefined ? options.gitContext : null;
  const formattedCwd = cwd ? formatCwdWithTilde(cwd) : "";
  const stats = calculateTranscriptStats(messages);

  const transcript: UnifiedTranscript = unifiedTranscriptSchema.parse({
    v: 1 as const,
    id: transcriptId,
    source: "pi" as const,
    timestamp,
    preview,
    summary: null,
    model: primaryModel,
    clientVersion: options.clientVersion ?? null,
    blendedTokens,
    costUsd,
    messageCount: messages.length,
    ...stats,
    tokenUsage: {
      inputTokens: tokenUsage.inputTokens,
      cachedInputTokens: tokenUsage.cachedInputTokens,
      outputTokens: tokenUsage.outputTokens,
      reasoningOutputTokens: tokenUsage.reasoningOutputTokens,
      totalTokens: tokenUsage.totalTokens,
    },
    modelUsage: Array.from(modelUsageMap.entries()).map(([model, usage]) =>
      unifiedModelUsageSchema.parse({ model, usage }),
    ),
    git: gitContext,
    cwd: formattedCwd,
    messages,
  });

  return { transcript, blobs };
}

// ============================================================================
// Tree Navigation
// ============================================================================

/**
 * Find the leaf entry ID (entry with no children pointing to it).
 */
function findLeafId(entries: PiSessionEntry[]): string | null {
  const hasChildren = new Set<string>();
  for (const entry of entries) {
    if (entry.parentId) {
      hasChildren.add(entry.parentId);
    }
  }

  // Find entries that have no children (are leaves)
  // Return the one with the latest timestamp
  let latestLeaf: { id: string; timestamp: string } | null = null;
  for (const entry of entries) {
    if (!hasChildren.has(entry.id)) {
      if (!latestLeaf || entry.timestamp > latestLeaf.timestamp) {
        latestLeaf = { id: entry.id, timestamp: entry.timestamp };
      }
    }
  }

  return latestLeaf?.id ?? null;
}

/**
 * Build a linear branch from leaf to root (returns in chronological order).
 */
function buildLinearBranch(entries: PiSessionEntry[], leafId: string): PiSessionEntry[] {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const branch: PiSessionEntry[] = [];

  let currentId: string | null = leafId;
  while (currentId) {
    const entry = entryById.get(currentId);
    if (!entry) break;
    branch.unshift(entry); // Prepend to get chronological order
    currentId = entry.parentId;
  }

  return branch;
}

/**
 * Get the branch anchor ID for a given leaf.
 * Returns the first entry after a branch point, or null if linear.
 */
function getBranchAnchorId(entries: PiSessionEntry[], leafId: string): string | null {
  // Build parent→children map
  const childrenOf = new Map<string | null, string[]>();
  for (const entry of entries) {
    const siblings = childrenOf.get(entry.parentId) ?? [];
    siblings.push(entry.id);
    childrenOf.set(entry.parentId, siblings);
  }

  // Walk from leaf to root
  const entryById = new Map(entries.map((e) => [e.id, e]));
  let currentId: string | null = leafId;

  while (currentId) {
    const entry = entryById.get(currentId);
    if (!entry) break;

    const parentId = entry.parentId;
    const siblings = childrenOf.get(parentId) ?? [];

    // If parent has multiple children, THIS entry is where our branch diverged
    if (siblings.length > 1) {
      return currentId;
    }

    currentId = parentId;
  }

  return null; // No branching, linear conversation
}

// ============================================================================
// Message Conversion
// ============================================================================

type ConversionState = {
  messages: UnifiedTranscriptMessage[];
  blobs: Map<string, TranscriptBlob>;
  tokenUsage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
    cost: number;
  };
  modelUsageMap: Map<string, UnifiedTokenUsage>;
  primaryModel: string | null;
  cwd: string | null;
  toolCallsById: Map<string, number>; // toolCallId -> message index
};

function convertEntriesToMessages(entries: PiSessionEntry[], headerCwd: string): ConversionState {
  const state: ConversionState = {
    messages: [],
    blobs: new Map(),
    tokenUsage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      cost: 0,
    },
    modelUsageMap: new Map(),
    primaryModel: null,
    cwd: headerCwd,
    toolCallsById: new Map(),
  };

  for (const entry of entries) {
    if (entry.type === "message") {
      convertMessageEntry(entry, state);
    } else if (entry.type === "compaction") {
      convertCompactionEntry(entry, state);
    }
    // Skip other entry types (model_change, thinking_level_change, etc.)
  }

  return state;
}

function convertMessageEntry(entry: PiMessageEntry, state: ConversionState): void {
  const msg = entry.message;
  const timestamp = entry.timestamp;
  const cwd = state.cwd;

  switch (msg.role) {
    case "user": {
      const { text, images } = extractUserContent(msg.content, state.blobs);
      if (text || images.length > 0) {
        const userMsg: Record<string, unknown> = {
          type: "user",
          text: text || "",
          timestamp,
        };
        if (images.length > 0) {
          userMsg.images = images;
        }
        state.messages.push(unifiedTranscriptMessageSchema.parse(userMsg));
      }
      break;
    }

    case "assistant": {
      const model = `${msg.provider}/${msg.model}`;
      if (!state.primaryModel) {
        state.primaryModel = model;
      }

      // Accumulate token usage
      if (msg.usage) {
        state.tokenUsage.inputTokens += msg.usage.input ?? 0;
        state.tokenUsage.cachedInputTokens += msg.usage.cacheRead ?? 0;
        state.tokenUsage.outputTokens += msg.usage.output ?? 0;
        state.tokenUsage.totalTokens += msg.usage.totalTokens ?? 0;
        state.tokenUsage.cost += msg.usage.cost?.total ?? 0;

        // Accumulate per-model usage
        const existing = state.modelUsageMap.get(model) ?? {
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: 0,
        };
        existing.inputTokens += msg.usage.input ?? 0;
        existing.cachedInputTokens += msg.usage.cacheRead ?? 0;
        existing.outputTokens += msg.usage.output ?? 0;
        existing.totalTokens += msg.usage.totalTokens ?? 0;
        state.modelUsageMap.set(model, existing);
      }

      // Process content blocks
      for (const block of msg.content) {
        if (block.type === "thinking" && block.thinking) {
          state.messages.push(
            unifiedTranscriptMessageSchema.parse({
              type: "thinking",
              text: block.thinking,
              timestamp,
              model,
            }),
          );
        } else if (block.type === "text" && block.text) {
          state.messages.push(
            unifiedTranscriptMessageSchema.parse({
              type: "agent",
              text: block.text,
              timestamp,
              model,
            }),
          );
        } else if (block.type === "toolCall") {
          const toolName = normalizeToolName(block.name);
          const input = sanitizeToolInput(toolName, block.arguments, cwd);

          const toolCallMsg = unifiedTranscriptMessageSchema.parse({
            type: "tool-call",
            id: block.id,
            toolName,
            input,
            timestamp,
            model,
          });
          state.toolCallsById.set(block.id, state.messages.length);
          state.messages.push(toolCallMsg);
        }
      }
      break;
    }

    case "toolResult": {
      // Find the corresponding tool call and update it with output
      const toolCallIndex = state.toolCallsById.get(msg.toolCallId);
      if (toolCallIndex !== undefined) {
        const toolCall = state.messages[toolCallIndex] as UnifiedTranscriptMessage & { type: "tool-call" };
        const { output, images } = sanitizeToolOutput(msg.toolName, msg.content, msg.details, cwd, state.blobs);
        (toolCall as Record<string, unknown>).output = output;
        if (images.length > 0) {
          (toolCall as Record<string, unknown>).images = images;
        }
        if (msg.isError) {
          (toolCall as Record<string, unknown>).isError = true;
        }
      }
      break;
    }

    case "bashExecution": {
      // User-executed bash command (! or !!)
      state.messages.push(
        unifiedTranscriptMessageSchema.parse({
          type: "command",
          name: msg.excludeFromContext ? "!!" : "!",
          args: msg.command,
          output: msg.output || undefined,
          timestamp,
        }),
      );
      break;
    }

    case "compactionSummary": {
      state.messages.push(
        unifiedTranscriptMessageSchema.parse({
          type: "compaction-summary",
          text: msg.summary,
          timestamp,
        }),
      );
      break;
    }

    case "branchSummary": {
      // Include branch summaries as agent messages for context
      state.messages.push(
        unifiedTranscriptMessageSchema.parse({
          type: "agent",
          text: `[Branch summary] ${msg.summary}`,
          timestamp,
        }),
      );
      break;
    }

    case "custom": {
      // Skip custom messages for now
      break;
    }
  }
}

function convertCompactionEntry(entry: PiCompactionEntry, state: ConversionState): void {
  state.messages.push(
    unifiedTranscriptMessageSchema.parse({
      type: "compaction-summary",
      text: entry.summary,
      timestamp: entry.timestamp,
    }),
  );
}

// ============================================================================
// Content Extraction
// ============================================================================

function extractUserContent(
  content: string | PiContentBlock[],
  blobs: Map<string, TranscriptBlob>,
): { text: string; images: Array<{ sha256: string; mediaType: string }> } {
  if (typeof content === "string") {
    return { text: content, images: [] };
  }

  const texts: string[] = [];
  const images: Array<{ sha256: string; mediaType: string }> = [];

  for (const block of content) {
    if (block.type === "text" && block.text) {
      texts.push(block.text);
    } else if (block.type === "image") {
      const data = Buffer.from(block.data, "base64");
      const sha256 = computeSha256(data);
      if (!blobs.has(sha256)) {
        blobs.set(sha256, { data, mediaType: block.mimeType });
      }
      images.push({ sha256, mediaType: block.mimeType });
    }
  }

  return { text: texts.join("\n\n"), images };
}

function computeSha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ============================================================================
// Tool Sanitization
// ============================================================================

function normalizeToolName(name: string): string {
  return TOOL_NAME_MAP[name.toLowerCase()] ?? name;
}

function sanitizeToolInput(toolName: string, input: unknown, cwd: string | null): unknown {
  if (!input || typeof input !== "object") return input;

  const record = { ...(input as Record<string, unknown>) };

  // Normalize path → file_path
  if (typeof record.path === "string") {
    record.file_path = cwd ? relativizePath(record.path, cwd) : record.path;
    delete record.path;
  }

  // Relativize file_path
  if (typeof record.file_path === "string" && cwd) {
    record.file_path = relativizePath(record.file_path, cwd);
  }

  // Apply generic path relativization
  return cwd ? relativizePaths(record, cwd) : record;
}

function sanitizeToolOutput(
  toolName: string,
  content: PiContentBlock[],
  details: unknown,
  cwd: string | null,
  blobs: Map<string, TranscriptBlob>,
): { output: unknown; images: Array<{ sha256: string; mediaType: string }> } {
  // Extract text and images from content
  const texts: string[] = [];
  const images: Array<{ sha256: string; mediaType: string }> = [];
  for (const block of content) {
    if (block.type === "text" && block.text) {
      texts.push(block.text);
    } else if (block.type === "image") {
      const data = Buffer.from(block.data, "base64");
      const sha256 = computeSha256(data);
      if (!blobs.has(sha256)) {
        blobs.set(sha256, { data, mediaType: block.mimeType });
      }
      images.push({ sha256, mediaType: block.mimeType });
    }
  }

  const textOutput = texts.join("\n");

  // For Edit tool, include diff from details
  if (toolName === "edit" && details && typeof details === "object") {
    const d = details as Record<string, unknown>;
    if (d.diff) {
      return { output: { diff: d.diff }, images };
    }
  }

  // For Read tool, format as file object (only if we have text, not just images)
  if (toolName === "read" && textOutput) {
    const numLines = textOutput.split("\n").length;
    return {
      output: {
        file: {
          content: textOutput,
          numLines,
          totalLines: numLines,
        },
      },
      images,
    };
  }

  // Default: return text output or details
  const defaultOutput = textOutput || (cwd ? relativizePaths(details, cwd) : details);
  return { output: defaultOutput, images };
}

function relativizePath(target: string, cwd: string): string {
  if (!target) return target;

  const isAbsolutePath = target.startsWith("/");
  const normalizedTarget = target.replace(/\\/g, "/");

  if (!isAbsolutePath) {
    if (normalizedTarget === "." || normalizedTarget === "./") return ".";
    if (normalizedTarget.startsWith("./") || normalizedTarget.startsWith("../")) {
      return normalizedTarget;
    }
    return `./${normalizedTarget}`;
  }

  // Make absolute path relative to cwd
  const normalizedCwd = cwd.replace(/\\/g, "/");
  if (normalizedTarget.startsWith(normalizedCwd + "/")) {
    const relative = normalizedTarget.slice(normalizedCwd.length + 1);
    return `./${relative}`;
  }

  // For paths outside cwd, replace home directory with ~
  return formatCwdWithTilde(normalizedTarget);
}

// ============================================================================
// Helpers
// ============================================================================

function derivePreview(messages: UnifiedTranscriptMessage[]): string | null {
  for (const msg of messages) {
    if (msg.type === "user" && msg.text) {
      return collapseWhitespace(msg.text);
    }
  }
  return null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function blendedTokenTotal(usage: {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}): number {
  const nonCached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return nonCached + usage.outputTokens + usage.reasoningOutputTokens;
}

// ============================================================================
// Cost Calculation
// ============================================================================

const PROVIDER_PREFIXES = ["anthropic/", "openai/", "google/"];
const DEFAULT_TIERED_THRESHOLD = 200_000;

function calculateCostFromUsage(
  modelName: string | null,
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
  pricingData: Record<string, LiteLLMModelPricing> | undefined,
): number {
  if (!pricingData || !modelName) return 0;

  const pricing = resolvePricingForModel(modelName, pricingData);
  if (!pricing) return 0;

  return calculateCostFromPricing(
    {
      input_tokens: Math.max(0, usage.inputTokens - usage.cachedInputTokens),
      output_tokens: usage.outputTokens,
      cache_read_input_tokens: usage.cachedInputTokens,
    },
    pricing,
  );
}

function resolvePricingForModel(
  modelName: string,
  pricingData: Record<string, LiteLLMModelPricing>,
): LiteLLMModelPricing | null {
  const normalizedName = modelName.trim();
  if (!normalizedName) return null;

  const candidates = new Set<string>();
  candidates.add(normalizedName);
  for (const prefix of PROVIDER_PREFIXES) {
    candidates.add(`${prefix}${normalizedName}`);
  }

  for (const candidate of candidates) {
    const pricing = pricingData[candidate];
    if (pricing) return pricing;
  }

  return null;
}

function calculateCostFromPricing(
  tokens: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  },
  pricing: LiteLLMModelPricing,
): number {
  const calculateTieredCost = (
    totalTokens: number | undefined,
    basePrice: number | undefined,
    tieredPrice: number | undefined,
    threshold: number = DEFAULT_TIERED_THRESHOLD,
  ) => {
    if (totalTokens == null || totalTokens <= 0) return 0;

    if (totalTokens > threshold && tieredPrice != null) {
      const tokensBelowThreshold = Math.min(totalTokens, threshold);
      const tokensAboveThreshold = Math.max(0, totalTokens - threshold);

      let tieredCost = tokensAboveThreshold * tieredPrice;
      if (basePrice != null) {
        tieredCost += tokensBelowThreshold * basePrice;
      }
      return tieredCost;
    }

    if (basePrice != null) {
      return totalTokens * basePrice;
    }

    return 0;
  };

  const inputCost = calculateTieredCost(
    tokens.input_tokens,
    pricing.input_cost_per_token,
    pricing.input_cost_per_token_above_200k_tokens,
  );

  const outputCost = calculateTieredCost(
    tokens.output_tokens,
    pricing.output_cost_per_token,
    pricing.output_cost_per_token_above_200k_tokens,
  );

  const cacheReadCost = calculateTieredCost(
    tokens.cache_read_input_tokens,
    pricing.cache_read_input_token_cost,
    pricing.cache_read_input_token_cost_above_200k_tokens,
  );

  return inputCost + outputCost + cacheReadCost;
}

// ============================================================================
// Exports
// ============================================================================

export type { UnifiedGitContext, UnifiedTokenUsage, UnifiedTranscript, UnifiedTranscriptMessage };
