import path from "node:path";
import type { UnifiedGitContext, UnifiedTokenUsage, UnifiedTranscript, UnifiedTranscriptMessage } from "./claudecode";
import { formatCwdWithTilde } from "./paths";
import type { LiteLLMModelPricing } from "./pricing";
import {
  unifiedGitContextSchema,
  unifiedModelUsageSchema,
  unifiedTranscriptMessageSchema,
  unifiedTranscriptSchema,
} from "./schemas";

// ============================================================================
// OpenCode Export Types (Real format from `opencode export`)
// ============================================================================

export type OpenCodeExport = {
  info: OpenCodeSessionInfo;
  messages: OpenCodeMessage[];
};

export type OpenCodeSessionInfo = {
  id: string;
  version?: string;
  projectID?: string;
  directory?: string;
  title?: string;
  time: {
    created: number; // milliseconds since epoch
    updated?: number;
  };
  summary?: {
    additions?: number;
    deletions?: number;
    files?: number;
  };
};

export type OpenCodeMessage = {
  info: OpenCodeMessageInfo;
  parts: OpenCodePart[];
};

export type OpenCodeMessageInfo = {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: {
    created: number;
    completed?: number;
  };
  parentID?: string;
  modelID?: string;
  providerID?: string;
  mode?: string;
  agent?: string;
  path?: {
    cwd?: string;
    root?: string;
  };
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning?: number;
    cache?: {
      read: number;
      write: number;
    };
  };
  finish?: string;
  summary?: {
    title?: string;
    diffs?: unknown[];
  };
  model?: {
    providerID?: string;
    modelID?: string;
  };
};

export type OpenCodeToolState = {
  status?: "pending" | "running" | "completed" | "error";
  input?: unknown;
  output?: unknown;
  error?: string;
  title?: string;
  metadata?: {
    diagnostics?: unknown;
    filepath?: string;
    exists?: boolean;
    truncated?: boolean;
    diff?: string;
    filediff?: {
      file?: string;
      before?: string;
      after?: string;
      additions?: number;
      deletions?: number;
    };
    preview?: string;
    output?: string;
    exit?: number;
    description?: string;
  };
  time?: {
    start?: number;
    end?: number;
  };
};

export type OpenCodePart =
  | { type: "text"; id?: string; text: string; time?: { start?: number; end?: number } }
  | {
      type: "tool";
      id?: string;
      callID: string;
      tool: string;
      state?: OpenCodeToolState;
      metadata?: unknown;
    }
  | { type: "reasoning"; id?: string; text: string; metadata?: unknown; time?: { start?: number; end?: number } }
  | { type: "step-start"; id?: string }
  | {
      type: "step-finish";
      id?: string;
      reason?: string;
      cost?: number;
      tokens?: { input: number; output: number; reasoning?: number; cache?: { read: number; write: number } };
    };

export type ConvertOpenCodeOptions = {
  now?: Date;
  gitContext?: UnifiedGitContext | null;
  cwd?: string | null;
  pricing?: Record<string, LiteLLMModelPricing>;
};

// ============================================================================
// Tool Name Mapping
// ============================================================================

const TOOL_NAME_MAP: Record<string, string> = {
  // OpenCode built-in tools → Unified names
  shell: "Bash",
  bash: "Bash",
  read_file: "Read",
  read: "Read",
  write_file: "Write",
  write: "Write",
  edit_file: "Edit",
  edit: "Edit",
  glob: "Glob",
  grep: "Grep",
  find: "Glob",
  list_files: "Glob",
  // MCP and other tools keep their names
};

// ============================================================================
// Provider Prefixes for Pricing Lookup
// ============================================================================

const PROVIDER_PREFIXES = [
  "anthropic/",
  "claude-3-5-",
  "claude-3-",
  "claude-",
  "openai/",
  "azure/",
  "openrouter/",
  "google/",
  "gemini/",
];

const DEFAULT_TIERED_THRESHOLD = 200_000;

// ============================================================================
// Main Converter
// ============================================================================

/**
 * Convert an OpenCode export to a unified transcript.
 */
export function convertOpenCodeTranscript(
  data: OpenCodeExport,
  options: ConvertOpenCodeOptions = {},
): UnifiedTranscript | null {
  const { info, messages } = data;

  if (!messages || messages.length === 0) {
    return null;
  }

  const cwd = options.cwd ?? info.directory ?? null;
  const unifiedMessages: UnifiedTranscriptMessage[] = [];
  const userTexts: string[] = [];
  let primaryModel: string | null = null;
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalReasoningTokens = 0;
  let totalCacheReadTokens = 0;

  // Sort messages by creation time
  const sortedMessages = [...messages].sort((a, b) => {
    return a.info.time.created - b.info.time.created;
  });

  for (const message of sortedMessages) {
    const msgInfo = message.info;
    const model = computeModelIdentifier(msgInfo);

    // Track primary model from assistant messages
    if (msgInfo.role === "assistant" && model && !primaryModel) {
      primaryModel = model;
    }

    // Accumulate token usage from assistant messages
    if (msgInfo.role === "assistant" && msgInfo.tokens) {
      totalInputTokens += msgInfo.tokens.input ?? 0;
      totalOutputTokens += msgInfo.tokens.output ?? 0;
      totalReasoningTokens += msgInfo.tokens.reasoning ?? 0;
      totalCacheReadTokens += msgInfo.tokens.cache?.read ?? 0;
    }

    if (msgInfo.role === "assistant" && msgInfo.cost) {
      totalCost += msgInfo.cost;
    }

    for (const part of message.parts) {
      // Skip step-start and step-finish parts
      if (part.type === "step-start" || part.type === "step-finish") {
        continue;
      }

      const timestamp = new Date(msgInfo.time.created).toISOString();

      switch (part.type) {
        case "text": {
          const text = part.text?.trim();
          if (!text) break;

          if (msgInfo.role === "user") {
            userTexts.push(text);
            unifiedMessages.push(
              unifiedTranscriptMessageSchema.parse({
                type: "user",
                text,
                id: msgInfo.id,
                timestamp,
              }),
            );
          } else {
            unifiedMessages.push(
              unifiedTranscriptMessageSchema.parse({
                type: "agent",
                text,
                id: msgInfo.id,
                timestamp,
                model: model ?? undefined,
              }),
            );
          }
          break;
        }

        case "reasoning": {
          const text = part.text?.trim();
          if (!text) break;

          unifiedMessages.push(
            unifiedTranscriptMessageSchema.parse({
              type: "thinking",
              text,
              timestamp,
              model: model ?? undefined,
            }),
          );
          break;
        }

        case "tool": {
          const toolName = normalizeToolName(part.tool);
          const state = part.state ?? {};

          const sanitizedInput = sanitizeToolInput(toolName, state.input, cwd);
          const sanitizedOutput = sanitizeToolOutput(toolName, state.output, state.metadata, cwd);

          unifiedMessages.push(
            unifiedTranscriptMessageSchema.parse({
              type: "tool-call",
              id: part.callID,
              timestamp,
              model: model ?? undefined,
              toolName,
              input: sanitizedInput,
              output: sanitizedOutput,
              error: state.error,
              isError: state.status === "error" || !!state.error,
            }),
          );
          break;
        }
      }
    }
  }

  if (unifiedMessages.length === 0) {
    return null;
  }

  // Build token usage
  const tokenUsage: UnifiedTokenUsage = {
    inputTokens: totalInputTokens,
    cachedInputTokens: totalCacheReadTokens,
    outputTokens: totalOutputTokens,
    reasoningOutputTokens: totalReasoningTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
  };

  const blendedTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
  const costUsd = totalCost > 0 ? totalCost : calculateCostFromUsage(primaryModel, tokenUsage, options.pricing);

  const timestamp = new Date(info.time.created);
  const preview = derivePreview(userTexts);

  const gitContext =
    options.gitContext !== undefined
      ? options.gitContext
      : unifiedGitContextSchema.parse({
          repo: null,
          branch: null,
          relativeCwd: extractRelativeCwd(sortedMessages),
        });

  const formattedCwd = cwd ? formatCwdWithTilde(cwd) : null;

  const transcript: UnifiedTranscript = unifiedTranscriptSchema.parse({
    v: 1 as const,
    id: info.id,
    source: "opencode" as const,
    timestamp,
    preview,
    model: primaryModel,
    blendedTokens,
    costUsd,
    messageCount: unifiedMessages.length,
    tokenUsage,
    modelUsage: primaryModel
      ? [
          unifiedModelUsageSchema.parse({
            model: primaryModel,
            usage: tokenUsage,
          }),
        ]
      : [],
    git: gitContext,
    cwd: formattedCwd,
    messages: unifiedMessages,
  });

  return transcript;
}

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeToolName(name: string): string {
  const lower = name.toLowerCase();
  return TOOL_NAME_MAP[lower] ?? name;
}

/**
 * Compute the model identifier from message info.
 * Returns `${providerID}/${modelID}` when both are available.
 */
function computeModelIdentifier(msgInfo: OpenCodeMessageInfo): string | null {
  const modelID = msgInfo.modelID ?? msgInfo.model?.modelID;
  const providerID = msgInfo.providerID ?? msgInfo.model?.providerID;

  if (!modelID) return null;
  if (providerID) return `${providerID}/${modelID}`;
  return modelID;
}

/**
 * Extract relativeCwd from OpenCode message path data.
 * Computes the relative path from root (git worktree) to cwd.
 */
function extractRelativeCwd(messages: OpenCodeMessage[]): string | null {
  // Find the first message with path info
  for (const message of messages) {
    const msgPath = message.info.path;
    if (msgPath?.root && msgPath?.cwd) {
      if (msgPath.root === msgPath.cwd) {
        return null; // At root, no relative path
      }
      try {
        const relative = path.relative(msgPath.root, msgPath.cwd).replace(/\\/g, "/");
        if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
          return relative;
        }
      } catch {
        // Ignore errors
      }
    }
  }

  return null;
}

function derivePreview(userTexts: string[]): string | null {
  for (const text of userTexts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    // Skip system-like messages
    if (trimmed.startsWith("<") && trimmed.includes(">")) continue;
    // Remove surrounding quotes if present
    const unquoted = trimmed.replace(/^["']|["']$/g, "");
    return truncate(unquoted, 80);
  }
  return userTexts.length > 0 ? truncate(userTexts[0], 80) : null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 1)}…`;
}

// ============================================================================
// Tool Input/Output Sanitization
// ============================================================================

function sanitizeToolInput(toolName: string, input: unknown, cwd: string | null): unknown {
  if (!input || typeof input !== "object") return input;

  const record = { ...(input as Record<string, unknown>) };

  // Relativize file paths
  if (typeof record.filePath === "string" && cwd) {
    record.filePath = relativizePath(record.filePath, cwd);
  }
  if (typeof record.file_path === "string" && cwd) {
    record.file_path = relativizePath(record.file_path, cwd);
  }
  if (typeof record.path === "string" && cwd) {
    record.path = relativizePath(record.path, cwd);
  }
  if (typeof record.workdir === "string" && cwd) {
    record.workdir = relativizePath(record.workdir, cwd);
  }

  return record;
}

function sanitizeToolOutput(
  toolName: string,
  output: unknown,
  metadata: OpenCodeToolState["metadata"],
  _cwd: string | null,
): unknown {
  // For Bash, extract from metadata
  if (toolName === "Bash" && metadata) {
    const result: Record<string, unknown> = {};
    if (typeof metadata.output === "string") {
      result.stdout = metadata.output;
    }
    if (typeof metadata.exit === "number") {
      result.exitCode = metadata.exit;
    }
    if (typeof metadata.description === "string") {
      result.description = metadata.description;
    }
    return Object.keys(result).length > 0 ? result : output;
  }

  // For Read, extract content from metadata.preview or output
  if (toolName === "Read" && metadata?.preview) {
    return { content: metadata.preview };
  }

  // For Edit, extract diff from metadata
  if (toolName === "Edit" && metadata?.filediff) {
    return {
      diff: metadata.diff,
      additions: metadata.filediff.additions,
      deletions: metadata.filediff.deletions,
    };
  }

  // For Write, check if file existed
  if (toolName === "Write" && metadata) {
    return { created: !metadata.exists };
  }

  return output;
}

function relativizePath(target: string, cwd: string): string {
  if (!target) return target;

  const isAbsolutePath = path.isAbsolute(target);
  const normalizedTarget = target.replace(/\\/g, "/");

  if (!isAbsolutePath) {
    if (normalizedTarget === "." || normalizedTarget === "./") return ".";
    if (normalizedTarget.startsWith("./") || normalizedTarget.startsWith("../")) {
      return normalizedTarget;
    }
    return `./${normalizedTarget}`;
  }

  try {
    const relative = path.relative(cwd, target).replace(/\\/g, "/");
    if (relative === "") return ".";
    if (relative.startsWith("..") || path.isAbsolute(relative)) return target;
    return relative === "." ? "." : `./${relative}`;
  } catch {
    return target;
  }
}

// ============================================================================
// Cost Calculation
// ============================================================================

function calculateCostFromUsage(
  modelName: string | null,
  usage: UnifiedTokenUsage,
  pricingData: Record<string, LiteLLMModelPricing> | undefined,
): number {
  if (!pricingData || !modelName) return 0;

  const pricing = resolvePricingForModel(modelName, pricingData);
  if (!pricing) return 0;

  return calculateCostFromPricing(
    {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_creation_input_tokens: 0,
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

  const lower = normalizedName.toLowerCase();
  for (const [key, pricing] of Object.entries(pricingData)) {
    const comparison = key.toLowerCase();
    if (comparison.includes(lower) || lower.includes(comparison)) {
      return pricing;
    }
  }

  return null;
}

function calculateCostFromPricing(
  tokens: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
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

  const cacheCreationCost = calculateTieredCost(
    tokens.cache_creation_input_tokens,
    pricing.cache_creation_input_token_cost,
    pricing.cache_creation_input_token_cost_above_200k_tokens,
  );

  const cacheReadCost = calculateTieredCost(
    tokens.cache_read_input_tokens,
    pricing.cache_read_input_token_cost,
    pricing.cache_read_input_token_cost_above_200k_tokens,
  );

  return inputCost + outputCost + cacheCreationCost + cacheReadCost;
}

// ============================================================================
// Exports
// ============================================================================

export type { UnifiedGitContext, UnifiedTokenUsage, UnifiedTranscript, UnifiedTranscriptMessage };
