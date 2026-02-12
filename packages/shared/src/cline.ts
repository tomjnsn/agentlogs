import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
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
import {
  toolCallMessageWithShapesSchema,
  unifiedModelUsageSchema,
  unifiedTranscriptMessageSchema,
  unifiedTranscriptSchema,
} from "./schemas";

// ============================================================================
// Cline Types
// ============================================================================

/**
 * A single message in Cline's api_conversation_history.json.
 * Follows the Anthropic Messages API format with Cline-specific extensions.
 */
export type ClineMessage = {
  role: "user" | "assistant";
  content: ClineContentBlock[];
  modelInfo?: ClineModelInfo;
  metrics?: ClineMetrics;
};

export type ClineContentBlock = ClineTextBlock | ClineToolUseBlock | ClineToolResultBlock | ClineImageBlock;

export type ClineTextBlock = {
  type: "text";
  text: string;
};

export type ClineToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
  call_id?: string;
};

export type ClineToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string | ClineContentBlock[];
  is_error?: boolean;
};

export type ClineImageBlock = {
  type: "image";
  source: {
    type: string;
    media_type?: string;
    mediaType?: string;
    data: string;
  };
};

export type ClineModelInfo = {
  modelId: string;
  providerId: string;
  mode?: string;
};

export type ClineMetrics = {
  tokens?: {
    prompt?: number;
    completion?: number;
    cached?: number;
  };
};

/**
 * Cline task_metadata.json structure.
 */
export type ClineTaskMetadata = {
  files_in_context?: Array<{
    path: string;
    record_state: string;
    record_source: string;
    cline_read_date: number | null;
    cline_edit_date: number | null;
    user_edit_date: number | null;
  }>;
  model_usage?: Array<{
    ts: number;
    model_id: string;
    model_provider_id: string;
    mode?: string;
  }>;
  environment_history?: Array<{
    ts: number;
    os_name?: string;
    os_version?: string;
    os_arch?: string;
    host_name?: string;
    host_version?: string;
    cline_version?: string;
  }>;
};

// ============================================================================
// Conversion Options
// ============================================================================

export type ConvertClineOptions = {
  now?: Date;
  gitContext?: UnifiedGitContext | null;
  pricing?: Record<string, LiteLLMModelPricing>;
  clientVersion?: string;
  /** Task metadata from task_metadata.json (optional, enriches the transcript) */
  metadata?: ClineTaskMetadata;
  /** Working directory override */
  cwd?: string;
  /** Task ID (used as transcript ID) */
  taskId?: string;
};

// ============================================================================
// Tool Name Mapping
// ============================================================================

/** Map Cline tool names to unified tool names */
const TOOL_NAME_MAP: Record<string, string> = {
  read_file: "Read",
  write_to_file: "Write",
  replace_in_file: "Edit",
  execute_command: "Bash",
  search_files: "Grep",
  list_files: "Glob",
  list_code_definition_names: "Ls",
  load_mcp_documentation: "LoadMcpDocs",
  access_mcp_resource: "AccessMcpResource",
  focus_chain: "FocusChain",
  // Agent Response Tools that should be treated as agent messages with the response in the input
  attempt_completion: "AgentResponse",
  plan_mode_respond: "AgentResponse",
  ask_followup_question: "AgentResponse",
};

// Patterns to strip from user messages (Cline injects environment details, etc.)
const ENVIRONMENT_DETAILS_PATTERN = /<environment_details|feedback>[\s\S]*?<\/environment_details|feedback>/g;
const TASK_TAG_PATTERN = /^<task>\n?([\s\S]*?)\n?<\/task>/;
const TOOL_RESULT_PREFIX_PATTERN = /^\[[\w_]+ for '[^']*'\] Result:\n?/;

// ============================================================================
// Main Converter
// ============================================================================

/**
 * Convert a Cline transcript from a JSON file (api_conversation_history.json).
 */
export async function convertClineFile(
  filePath: string,
  options: ConvertClineOptions = {},
): Promise<ConversionResult | null> {
  const content = await fs.readFile(filePath, "utf8");
  let messages: ClineMessage[];
  try {
    messages = JSON.parse(content) as ClineMessage[];
  } catch {
    return null;
  }

  // Try to load metadata from sibling file
  let metadata = options.metadata;
  if (!metadata) {
    const metadataPath = path.join(path.dirname(filePath), "task_metadata.json");
    try {
      const metaContent = await fs.readFile(metadataPath, "utf8");
      metadata = JSON.parse(metaContent) as ClineTaskMetadata;
    } catch {
      // No metadata file, that's fine
    }
  }

  // Derive task ID from directory name if not provided
  let taskId = options.taskId;
  if (!taskId) {
    taskId = path.basename(path.dirname(filePath));
  }

  return convertClineTranscript(messages, { ...options, metadata, taskId });
}

/**
 * Convert a Cline transcript from in-memory message array.
 */
export function convertClineTranscript(
  rawMessages: ClineMessage[],
  options: ConvertClineOptions = {},
): ConversionResult | null {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return null;
  }

  const blobs = new Map<string, TranscriptBlob>();
  const unifiedMessages: UnifiedTranscriptMessage[] = [];
  const toolCallById = new Map<string, number>(); // tool_use id -> message index

  // Track token usage
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  const modelUsageMap = new Map<string, UnifiedTokenUsage>();
  let primaryModel: string | null = null;

  // Extract client version from metadata
  const clientVersion = options.clientVersion ?? options.metadata?.environment_history?.[0]?.cline_version ?? null;

  // Extract cwd from options
  const cwd = options.cwd ?? null;

  for (const msg of rawMessages) {
    if (msg.role === "user") {
      processUserMessage(msg, unifiedMessages, toolCallById, blobs, cwd);
    } else if (msg.role === "assistant") {
      // Extract model info
      const model = msg.modelInfo ? standardizeModelName(msg.modelInfo.modelId, msg.modelInfo.providerId) : null;
      if (model && !primaryModel) {
        primaryModel = model;
      }

      // Accumulate token usage
      if (msg.metrics?.tokens) {
        const tokens = msg.metrics.tokens;
        const prompt = tokens.prompt ?? 0;
        const completion = tokens.completion ?? 0;
        const cached = tokens.cached ?? 0;

        totalInputTokens += prompt + cached;
        totalOutputTokens += completion;
        totalCachedTokens += cached;

        if (model) {
          const existing = modelUsageMap.get(model) ?? {
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: 0,
          };
          existing.inputTokens += prompt + cached;
          existing.cachedInputTokens += cached;
          existing.outputTokens += completion;
          existing.totalTokens += prompt + cached + completion;
          modelUsageMap.set(model, existing);
        }
      }

      processAssistantMessage(msg, model, unifiedMessages, toolCallById, blobs, cwd);
    }
  }

  if (unifiedMessages.length === 0) {
    return null;
  }

  const tokenUsage: UnifiedTokenUsage = {
    inputTokens: totalInputTokens,
    cachedInputTokens: totalCachedTokens,
    outputTokens: totalOutputTokens,
    reasoningOutputTokens: 0,
    totalTokens: totalInputTokens + totalOutputTokens,
  };

  const blendedTokens = blendedTokenTotal(tokenUsage);
  const costUsd = primaryModel ? calculateCostFromUsage(primaryModel, tokenUsage, options.pricing) : 0;

  const preview = derivePreview(unifiedMessages);
  const timestamp = options.now ?? new Date();
  const gitContext = options.gitContext !== undefined ? options.gitContext : null;
  const formattedCwd = cwd ? formatCwdWithTilde(cwd) : "";
  const stats = calculateTranscriptStats(unifiedMessages);

  const transcriptId = options.taskId ?? `cline-${timestamp.getTime()}`;

  const transcript: UnifiedTranscript = unifiedTranscriptSchema.parse({
    v: 1 as const,
    id: transcriptId,
    source: "cline" as const,
    timestamp,
    preview,
    summary: null,
    model: primaryModel,
    clientVersion,
    blendedTokens,
    costUsd,
    messageCount: unifiedMessages.length,
    ...stats,
    tokenUsage,
    modelUsage: Array.from(modelUsageMap.entries()).map(([model, usage]) =>
      unifiedModelUsageSchema.parse({ model, usage }),
    ),
    git: gitContext,
    cwd: formattedCwd,
    messages: unifiedMessages,
  });

  return { transcript, blobs };
}

// ============================================================================
// Message Processing
// ============================================================================

function processUserMessage(
  msg: ClineMessage,
  messages: UnifiedTranscriptMessage[],
  toolCallById: Map<string, number>,
  blobs: Map<string, TranscriptBlob>,
  cwd: string | null,
): void {
  for (const block of msg.content) {
    if (block.type === "text") {
      const text = normalizeTextContent((block as { text?: unknown }).text);
      if (!text) {
        continue;
      }

      // Check if this is a tool result
      if (TOOL_RESULT_PREFIX_PATTERN.test(text)) {
        // This is a tool result - try to match it to a pending tool call
        // Cline puts tool results as text blocks in user messages
        // We'll handle these via tool_result blocks instead
        continue;
      }

      // Strip environment details injected by Cline
      const cleaned = text.replace(ENVIRONMENT_DETAILS_PATTERN, "").trim();
      if (!cleaned) {
        continue;
      }

      // Extract task content from <task> tags
      const taskMatch = cleaned.match(TASK_TAG_PATTERN);
      const userText = taskMatch ? taskMatch[1].trim() : cleaned;

      if (!userText) {
        continue;
      }

      // Skip Cline system messages (tool results, task progress reminders, etc.)
      if (isSystemInjectedText(userText)) {
        continue;
      }

      messages.push(
        unifiedTranscriptMessageSchema.parse({
          type: "user",
          text: userText,
        }),
      );
    } else if (block.type === "tool_result") {
      // Merge tool result back into the corresponding tool call
      const toolResult = block as ClineToolResultBlock;
      const toolCallIndex = toolCallById.get(toolResult.tool_use_id);
      if (toolCallIndex !== undefined) {
        const toolCall = messages[toolCallIndex] as UnifiedTranscriptMessage & {
          type: "tool-call";
        };
        const output = extractToolResultContent(toolResult.content);
        (toolCall as Record<string, unknown>).output = output;
        if (toolResult.is_error) {
          (toolCall as Record<string, unknown>).isError = true;
        }

        // Re-sanitize after adding output
        const sanitized = sanitizeToolCall(toolCall, cwd);
        messages[toolCallIndex] = sanitized;
      }
    } else if (block.type === "image") {
      // Handle image blocks in user messages
      const imageBlock = block as ClineImageBlock;
      const imageRef = extractImageFromBlock(imageBlock, blobs);
      if (imageRef) {
        // Attach to the last user message if possible
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.type === "user") {
          const userMsg = lastMsg as Record<string, unknown>;
          const existingImages = (userMsg.images as Array<{ sha256: string; mediaType: string }>) ?? [];
          existingImages.push(imageRef);
          userMsg.images = existingImages;
        }
      }
    }
  }
}

function processAssistantMessage(
  msg: ClineMessage,
  model: string | null,
  messages: UnifiedTranscriptMessage[],
  toolCallById: Map<string, number>,
  _blobs: Map<string, TranscriptBlob>,
  cwd: string | null,
): void {
  for (const block of msg.content) {
    if (block.type === "text") {
      const text = normalizeTextContent((block as { text?: unknown }).text);
      if (!text) {
        continue;
      }

      messages.push(
        unifiedTranscriptMessageSchema.parse({
          type: "agent",
          text,
          model: model ?? undefined,
        }),
      );
    } else if (block.type === "tool_use") {
      const toolUse = block as ClineToolUseBlock;
      const toolName = normalizeToolName(toolUse.name);
      const input = sanitizeToolInput(toolName, toolUse.input, cwd);
      if (toolName === "AgentResponse") {
        const response =
          input && typeof input === "object"
            ? (input as Record<string, unknown>)?.response
            : typeof input === "string"
              ? input
              : undefined;
        const agentText = normalizeTextContent(response);
        if (agentText) {
          messages.push(
            unifiedTranscriptMessageSchema.parse({
              type: "agent",
              text: agentText,
              model: model ?? undefined,
            }),
          );
        }
        continue;
      }

      const toolCallMsg = unifiedTranscriptMessageSchema.parse({
        type: "tool-call",
        id: toolUse.id,
        toolName,
        input,
        model: model ?? undefined,
      });

      const sanitized = sanitizeToolCall(toolCallMsg as UnifiedTranscriptMessage & { type: "tool-call" }, cwd);
      toolCallById.set(toolUse.id, messages.length);
      messages.push(sanitized);
    }
  }
}

function normalizeTextContent(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (value == null) {
    return null;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "object") {
    try {
      const serialized = JSON.stringify(value);
      if (!serialized) {
        return null;
      }
      const trimmed = serialized.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return String(value).trim() || null;
    }
  }

  return String(value).trim() || null;
}

// ============================================================================
// Content Extraction
// ============================================================================

function extractToolResultContent(content: string | ClineContentBlock[]): unknown {
  if (typeof content === "string") {
    return content || undefined;
  }

  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (block.type === "text" && (block as ClineTextBlock).text) {
        texts.push((block as ClineTextBlock).text);
      }
    }
    return texts.length > 0 ? texts.join("\n") : undefined;
  }

  return undefined;
}

function extractImageFromBlock(
  block: ClineImageBlock,
  blobs: Map<string, TranscriptBlob>,
): { sha256: string; mediaType: string } | null {
  const source = block.source;
  if (!source?.data) {
    return null;
  }

  const mediaType = source.media_type ?? source.mediaType ?? "image/unknown";
  const data = Buffer.from(source.data, "base64");
  const sha256 = computeSha256(data);

  if (!blobs.has(sha256)) {
    blobs.set(sha256, { data, mediaType });
  }

  return { sha256, mediaType };
}

function computeSha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ============================================================================
// Tool Sanitization
// ============================================================================

function normalizeToolName(name: string): string {
  return TOOL_NAME_MAP[name] ?? name;
}

function sanitizeToolInput(toolName: string, input: unknown, cwd: string | null): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }

  const record = { ...(input as Record<string, unknown>) };

  // Strip task_progress from input (Cline-specific metadata, not useful in transcript)
  delete record.task_progress;

  // Normalize path fields
  if (typeof record.path === "string" && cwd) {
    record.file_path = relativizePath(record.path, cwd);
    delete record.path;
  }

  if (typeof record.file_path === "string" && cwd) {
    record.file_path = relativizePath(record.file_path, cwd);
  }

  // For Write tool: rename content field
  if (toolName === "Write" && typeof record.content === "string") {
    // content is already the right field name for Write
  }

  // For Edit tool (replace_in_file): convert to diff format
  if (toolName === "Edit" && typeof record.diff === "string") {
    // Cline uses a SEARCH/REPLACE block format in the diff field
    // Keep it as-is since it's already a diff representation
  }

  // For Bash tool: normalize command field
  if (toolName === "Bash" && typeof record.command === "string") {
    // Already in the right format
  }

  // For Grep tool (search_files): normalize fields
  if (toolName === "Grep") {
    if (typeof record.regex === "string") {
      record.pattern = record.regex;
      delete record.regex;
    }
  }

  if (toolName === "AgentResponse") {
    return record.response ?? record.result ?? record.question ?? record.options;
  }

  // Apply generic path relativization
  return cwd ? relativizePaths(record, cwd) : record;
}

function sanitizeToolCall(
  toolCall: UnifiedTranscriptMessage & { type: "tool-call" },
  cwd: string | null,
): UnifiedTranscriptMessage {
  if (!cwd) {
    return toolCall;
  }

  let { input, output } = toolCall;

  // Apply generic path relativization
  input = relativizePaths(input, cwd);
  output = relativizePaths(output, cwd);

  const result = {
    ...toolCall,
    input,
    output,
  };

  return toolCallMessageWithShapesSchema.parse(result) as UnifiedTranscriptMessage;
}

function relativizePath(target: string, cwd: string): string {
  if (!target) {
    return target;
  }

  const isAbsolutePath = path.isAbsolute(target);
  const normalizedTarget = target.replace(/\\/g, "/");

  if (!isAbsolutePath) {
    if (normalizedTarget === "." || normalizedTarget === "./") {
      return ".";
    }
    if (normalizedTarget.startsWith("./") || normalizedTarget.startsWith("../")) {
      return normalizedTarget;
    }
    return `./${normalizedTarget}`;
  }

  try {
    const relative = path.relative(cwd, target).replace(/\\/g, "/");
    if (relative === "") {
      return ".";
    }
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return target;
    }
    return `./${relative}`;
  } catch {
    return target;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if text is a Cline system-injected message (not user-authored).
 */
function isSystemInjectedText(text: string): boolean {
  // Task progress reminders
  if (text.includes("# TODO LIST UPDATE REQUIRED")) {
    return true;
  }
  if (text.includes("# task_progress RECOMMENDED")) {
    return true;
  }
  // Tool result text blocks (Cline puts these as text in user messages)
  if (
    text.startsWith("[apply_patch for patch application]") ||
    text.startsWith("[read_file for ") ||
    text.startsWith("[write_to_file for ")
  ) {
    return true;
  }
  if (text.startsWith("[replace_in_file for ") || text.startsWith("[execute_command for ")) {
    return true;
  }
  if (text.startsWith("[search_files for ") || text.startsWith("[list_files for ")) {
    return true;
  }
  if (text.startsWith("[list_code_definition_names for ") || text.startsWith("[access_mcp_resource for ")) {
    return true;
  }
  if (text.startsWith("[attempt_completion] ") || text.startsWith("[ask_followup_question] ")) {
    return true;
  }
  if (text.startsWith("[focus_chain] ") || text.startsWith("[plan_mode_respond] ")) {
    return true;
  }
  if (text.startsWith("[load_mcp_documentation] ")) {
    return true;
  }
  // Cline's "Current Mode" and other environment injections
  if (text.includes("# Current Mode") && text.includes("environment_details")) {
    return true;
  }
  if (text.startsWith("The user has provided feedback on the results.")) {
    return true;
  }
  return false;
}

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

function blendedTokenTotal(usage: UnifiedTokenUsage): number {
  const nonCached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return nonCached + usage.outputTokens + usage.reasoningOutputTokens;
}

function standardizeModelName(modelId: string, providerId: string): string {
  if (modelId.includes("/")) {
    return modelId;
  }
  return `${providerId}/${modelId}`;
}

// ============================================================================
// Cost Calculation
// ============================================================================

const PROVIDER_PREFIXES = ["anthropic/", "openai/", "google/"];
const DEFAULT_TIERED_THRESHOLD = 200_000;

function calculateCostFromUsage(
  modelName: string | null,
  usage: UnifiedTokenUsage,
  pricingData: Record<string, LiteLLMModelPricing> | undefined,
): number {
  if (!pricingData || !modelName) {
    return 0;
  }

  const pricing = resolvePricingForModel(modelName, pricingData);
  if (!pricing) {
    return 0;
  }

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
  if (!normalizedName) {
    return null;
  }

  const candidates = new Set<string>();
  candidates.add(normalizedName);
  for (const prefix of PROVIDER_PREFIXES) {
    candidates.add(`${prefix}${normalizedName}`);
  }

  for (const candidate of candidates) {
    const pricing = pricingData[candidate];
    if (pricing) {
      return pricing;
    }
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
    if (totalTokens == null || totalTokens <= 0) {
      return 0;
    }

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
