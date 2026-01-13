import fs from "node:fs/promises";
import path from "node:path";
import {
  calculateTranscriptStats,
  type ConversionResult,
  type UnifiedGitContext,
  type UnifiedModelUsage,
  type UnifiedTokenUsage,
  type UnifiedTranscript,
  type UnifiedTranscriptMessage,
} from "./claudecode";
import { formatCwdWithTilde, normalizeRelativeCwd } from "./paths";
import type { LiteLLMModelPricing } from "./pricing";
import {
  unifiedGitContextSchema,
  unifiedModelUsageSchema,
  unifiedTranscriptMessageSchema,
  unifiedTranscriptSchema,
} from "./schemas";

export type ConvertCodexOptions = {
  now?: Date;
  gitContext?: UnifiedGitContext | null;
  pricing?: Record<string, LiteLLMModelPricing>;
};

type CodexEvent = {
  type: string;
  timestamp?: string;
  payload: Record<string, unknown> | null;
};

type CodexSessionMeta = {
  id: string | null;
  cwd: string | null;
  git: {
    branch: string | null;
    repositoryUrl: string | null;
  };
};

type CodexToolCallIndex = {
  index: number;
  rawName: string | null;
};

type TokenUsageAccumulator = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

const ZERO_USAGE: TokenUsageAccumulator = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

const PROVIDER_PREFIXES = [
  "anthropic/",
  "claude-3-5-",
  "claude-3-",
  "claude-",
  "openai/",
  "azure/",
  "openrouter/openai/",
];

const DEFAULT_TIERED_THRESHOLD = 200_000;

const TOOL_NAMES: Record<string, string> = {
  shell: "Bash",
};

const IGNORED_USER_PREFIXES = ["<user_instructions", "<environment_context"];

/**
 * Convert a Codex transcript from an in-memory event array.
 */
export function convertCodexTranscript(
  events: Array<Record<string, unknown>>,
  options: ConvertCodexOptions = {},
): ConversionResult | null {
  const parsedEvents = normalizeEvents(events);
  if (parsedEvents.length === 0) {
    return null;
  }

  const toolCallById = new Map<string, CodexToolCallIndex>();
  const seenMessageSignatures = new Set<string>();
  const messages: UnifiedTranscriptMessage[] = [];
  const userMessages: string[] = [];

  let sessionMeta: CodexSessionMeta | null = null;
  let cwd: string | null = null;
  let primaryModel: string | null = null;
  let latestTimestamp: string | undefined;
  let accumulatedUsage: TokenUsageAccumulator = { ...ZERO_USAGE };
  let previousTotalUsage: TokenUsageAccumulator = { ...ZERO_USAGE };

  for (const event of parsedEvents) {
    if (!event) {
      continue;
    }

    const { type, payload, timestamp } = event;
    if (timestamp && (!latestTimestamp || compareIsoTimestamps(timestamp, latestTimestamp) > 0)) {
      latestTimestamp = timestamp;
    }

    if (type === "session_meta" && payload) {
      sessionMeta = extractSessionMeta(payload);
      if (!cwd) {
        cwd = sessionMeta.cwd;
      }
      continue;
    }

    if (type === "turn_context" && payload) {
      const contextCwd = asString(payload.cwd);
      if (contextCwd) {
        cwd = contextCwd;
      }
      const model = asString(payload.model);
      if (model) {
        primaryModel = model;
      }
      continue;
    }

    if (type === "event_msg" && payload) {
      const payloadType = asString(payload.type);

      if (payloadType === "token_count") {
        const lastUsage = extractTokenUsage(payload.info, "last_token_usage");
        const totalUsage = extractTokenUsage(payload.info, "total_token_usage");

        // Prefer last_token_usage (per-turn delta), fall back to calculating delta from total
        let deltaUsage: TokenUsageAccumulator | null = null;
        if (lastUsage) {
          deltaUsage = lastUsage;
        } else if (totalUsage) {
          // Calculate delta by subtracting previous total
          deltaUsage = {
            inputTokens: Math.max(0, totalUsage.inputTokens - previousTotalUsage.inputTokens),
            cachedInputTokens: Math.max(0, totalUsage.cachedInputTokens - previousTotalUsage.cachedInputTokens),
            outputTokens: Math.max(0, totalUsage.outputTokens - previousTotalUsage.outputTokens),
            reasoningOutputTokens: Math.max(
              0,
              totalUsage.reasoningOutputTokens - previousTotalUsage.reasoningOutputTokens,
            ),
            totalTokens: Math.max(0, totalUsage.totalTokens - previousTotalUsage.totalTokens),
          };
        }

        // Accumulate the delta
        if (deltaUsage) {
          accumulatedUsage = {
            inputTokens: accumulatedUsage.inputTokens + deltaUsage.inputTokens,
            cachedInputTokens: accumulatedUsage.cachedInputTokens + deltaUsage.cachedInputTokens,
            outputTokens: accumulatedUsage.outputTokens + deltaUsage.outputTokens,
            reasoningOutputTokens: accumulatedUsage.reasoningOutputTokens + deltaUsage.reasoningOutputTokens,
            totalTokens: accumulatedUsage.totalTokens + deltaUsage.totalTokens,
          };
        }

        // Update previous total for next delta calculation
        if (totalUsage) {
          previousTotalUsage = totalUsage;
        }
      }

      // The event stream mirrors response_items; rely on response_items to avoid duplicates.
      continue;
    }

    if (type !== "response_item" || !payload) {
      continue;
    }

    const payloadType = asString(payload.type);
    switch (payloadType) {
      case "message": {
        const role = asString(payload.role);
        const texts = extractTextPieces(payload.content);
        if (texts.length === 0) {
          break;
        }

        const text = collapseWhitespace(texts.join("\n\n"));
        if (!text) {
          break;
        }

        if (role === "user") {
          if (isIgnorableUserText(text)) {
            break;
          }
          userMessages.push(text);
          const id = asString(payload.id);
          const candidate: { type: "user"; text: string; timestamp?: string; id?: string } = {
            type: "user",
            timestamp,
            text,
          };
          if (id) {
            candidate.id = id;
          }
          addMessage(candidate, messages, seenMessageSignatures);
        } else if (role === "assistant") {
          const id = asString(payload.id);
          const candidate: { type: "agent"; text: string; timestamp?: string; id?: string; model?: string } = {
            type: "agent",
            timestamp,
            model: primaryModel ?? undefined,
            text,
          };
          if (id) {
            candidate.id = id;
          }
          addMessage(candidate, messages, seenMessageSignatures);
        }
        break;
      }

      case "reasoning": {
        const reasoningPieces = extractReasoning(payload);
        for (const text of reasoningPieces) {
          const id = asString(payload.id);
          const candidate: { type: "thinking"; text: string; timestamp?: string; id?: string; model?: string } = {
            type: "thinking",
            timestamp,
            model: primaryModel ?? undefined,
            text,
          };
          if (id) {
            candidate.id = id;
          }
          addMessage(candidate, messages, seenMessageSignatures);
        }
        break;
      }

      case "function_call": {
        const callId = asString(payload.call_id) ?? asString(payload.id) ?? undefined;
        const rawName = asString(payload.name);
        const toolName = normalizeToolName(rawName);
        const parsedArguments = parseJsonString(payload.arguments);
        const sanitizedInput = sanitizeFunctionCallInput(parsedArguments, cwd);

        const toolCall = unifiedTranscriptMessageSchema.parse({
          type: "tool-call",
          id: callId,
          timestamp,
          model: primaryModel ?? undefined,
          toolName,
          input: sanitizedInput,
        });

        const sanitized = sanitizeToolCall(toolCall, cwd, rawName);
        toolCallById.set(callId ?? "", { index: messages.push(sanitized) - 1, rawName });
        break;
      }

      case "function_call_output": {
        const callId = asString(payload.call_id);
        if (!callId) {
          break;
        }

        const entry = toolCallById.get(callId);
        if (!entry) {
          break;
        }

        const parsedOutput = parseJsonString(payload.output);
        const updated = updateToolCallOutput(messages[entry.index], parsedOutput, cwd, entry.rawName);
        messages[entry.index] = updated;
        break;
      }

      case "custom_tool_call": {
        const callId = asString(payload.call_id) ?? asString(payload.id) ?? undefined;
        const rawName = asString(payload.name);
        const toolName = normalizeToolName(rawName);
        const input = sanitizeCustomToolInput(rawName, payload.input, cwd);

        const toolCall = unifiedTranscriptMessageSchema.parse({
          type: "tool-call",
          id: callId,
          timestamp,
          model: primaryModel ?? undefined,
          toolName,
          input,
        });

        const sanitized = sanitizeToolCall(toolCall, cwd, rawName);
        toolCallById.set(callId ?? "", { index: messages.push(sanitized) - 1, rawName });
        break;
      }

      case "custom_tool_call_output": {
        const callId = asString(payload.call_id);
        if (!callId) {
          break;
        }

        const entry = toolCallById.get(callId);
        if (!entry) {
          break;
        }

        const parsedOutput = parseJsonString(payload.output);
        const updated = updateToolCallOutput(messages[entry.index], parsedOutput, cwd, entry.rawName);
        messages[entry.index] = updated;
        break;
      }

      default:
        break;
    }
  }

  if (messages.length === 0) {
    return null;
  }

  const timestamp = parseDate(latestTimestamp) ?? options.now ?? new Date();
  const preview = derivePreview(userMessages);

  const tokenUsage: TokenUsageAccumulator = accumulatedUsage ?? { ...ZERO_USAGE };
  const blendedTokens = blendedTokenTotal(tokenUsage);
  const costUsd = calculateCostFromUsage(primaryModel, tokenUsage, options.pricing);

  const gitContext = options.gitContext !== undefined ? options.gitContext : buildGitContext(sessionMeta, cwd);
  const formattedCwd = cwd ? formatCwdWithTilde(cwd) : "";
  const stats = calculateTranscriptStats(messages);

  const transcript: UnifiedTranscript = unifiedTranscriptSchema.parse({
    v: 1 as const,
    id: sessionMeta?.id ?? messages[0]?.id ?? createFallbackId(timestamp),
    source: "codex" as const,
    timestamp,
    preview,
    model: primaryModel,
    blendedTokens,
    costUsd,
    messageCount: messages.length,
    ...stats,
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
    messages,
  });

  return { transcript, blobs: new Map() };
}

/**
 * Convert a Codex transcript from a JSONL file.
 */
export async function convertCodexFile(
  filePath: string,
  options: ConvertCodexOptions = {},
): Promise<ConversionResult | null> {
  const content = await fs.readFile(filePath, "utf8");
  const events: Array<Record<string, unknown>> = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      events.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      continue;
    }
  }

  return convertCodexTranscript(events, options);
}

/**
 * Convert multiple Codex transcript files.
 */
export async function convertCodexFiles(
  filePaths: string[],
  options: ConvertCodexOptions = {},
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = [];
  for (const filePath of filePaths) {
    const result = await convertCodexFile(filePath, options);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

function normalizeEvents(events: Array<Record<string, unknown>>): CodexEvent[] {
  const normalized: CodexEvent[] = [];
  for (const event of events) {
    if (!event || typeof event !== "object") {
      continue;
    }
    const record = event as Record<string, unknown>;
    const type = asString(record.type);
    if (!type) {
      continue;
    }
    const timestamp = asString(record.timestamp) ?? undefined;
    const payload =
      record.payload && typeof record.payload === "object" ? (record.payload as Record<string, unknown>) : null;
    normalized.push({ type, timestamp, payload });
  }
  return normalized;
}

function extractSessionMeta(payload: Record<string, unknown>): CodexSessionMeta {
  const git = (payload.git ?? {}) as Record<string, unknown>;
  return {
    id: asString(payload.id),
    cwd: asString(payload.cwd),
    git: {
      branch: asString(git.branch),
      repositoryUrl: asString(git.repository_url ?? git.repositoryUrl),
    },
  };
}

function extractTokenUsage(
  value: unknown,
  preferredKey: "last_token_usage" | "total_token_usage" = "total_token_usage",
): TokenUsageAccumulator | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;

  // Try preferred key first, then fall back to the other
  let usageData: unknown;
  if (preferredKey === "last_token_usage") {
    usageData = record.last_token_usage ?? record.lastTokenUsage ?? record.total_token_usage ?? record.totalTokenUsage;
  } else {
    usageData = record.total_token_usage ?? record.totalTokenUsage ?? record.last_token_usage ?? record.lastTokenUsage;
  }

  if (!usageData || typeof usageData !== "object") {
    return null;
  }

  const usageRecord = usageData as Record<string, unknown>;
  return {
    inputTokens: ensureNumber(usageRecord.input_tokens ?? usageRecord.inputTokens),
    cachedInputTokens: ensureNumber(usageRecord.cached_input_tokens ?? usageRecord.cachedInputTokens),
    outputTokens: ensureNumber(usageRecord.output_tokens ?? usageRecord.outputTokens),
    reasoningOutputTokens: ensureNumber(usageRecord.reasoning_output_tokens ?? usageRecord.reasoningOutputTokens),
    totalTokens: ensureNumber(usageRecord.total_tokens ?? usageRecord.totalTokens),
  };
}

function extractTextPieces(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = collapseWhitespace(value);
    return normalized ? [normalized] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const results: string[] = [];
  for (const part of value) {
    if (!part) {
      continue;
    }
    if (typeof part === "string") {
      const normalized = collapseWhitespace(part);
      if (normalized) {
        results.push(normalized);
      }
      continue;
    }
    if (typeof part === "object") {
      const record = part as Record<string, unknown>;
      const text = asString(record.text ?? record.content);
      if (text) {
        const normalized = collapseWhitespace(text);
        if (normalized) {
          results.push(normalized);
        }
      }
    }
  }
  return results;
}

function extractReasoning(payload: Record<string, unknown>): string[] {
  const pieces: string[] = [];

  const summary = payload.summary;
  if (Array.isArray(summary)) {
    for (const entry of summary) {
      if (entry && typeof entry === "object") {
        const text = asString((entry as Record<string, unknown>).text);
        if (text) {
          const normalized = collapseWhitespace(text);
          if (normalized) {
            pieces.push(normalized);
          }
        }
      }
    }
  }

  const content = payload.content;
  if (Array.isArray(content)) {
    for (const entry of content) {
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        if (asString(record.type) === "reasoning" || asString(record.type) === "text") {
          const text = asString(record.text ?? record.content);
          if (text) {
            const normalized = collapseWhitespace(text);
            if (normalized) {
              pieces.push(normalized);
            }
          }
        }
      }
    }
  }

  return pieces;
}

function parseJsonString(value: unknown): unknown {
  const text = asString(value);
  if (!text) {
    return value;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function sanitizeFunctionCallInput(value: unknown, cwd: string | null): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = { ...(value as Record<string, unknown>) };
  if (typeof record.workdir === "string" && cwd) {
    record.workdir = relativizePath(record.workdir, cwd);
  }
  return record;
}

function sanitizeCustomToolInput(rawName: string | null, value: unknown, cwd: string | null): unknown {
  if (!value) {
    return value;
  }

  if (rawName === "apply_patch") {
    const text = asString(value);
    if (!text) {
      return value;
    }

    const parsed = parseApplyPatch(text, cwd);
    if (parsed.diff || parsed.file_path) {
      return parsed;
    }
  }

  return value;
}

function updateToolCallOutput(
  message: UnifiedTranscriptMessage,
  output: unknown,
  cwd: string | null,
  rawName: string | null,
): UnifiedTranscriptMessage {
  if (message.type !== "tool-call") {
    return message;
  }

  let sanitizedOutput: unknown = output;
  if (rawName === "shell") {
    sanitizedOutput = sanitizeShellOutput(output);
  } else if (rawName === "apply_patch") {
    sanitizedOutput = sanitizeApplyPatchOutput(output);
  }

  const updated = {
    ...message,
    output: sanitizedOutput,
  };

  // Try to convert bash commands to proper tools AFTER output is attached
  if (rawName === "shell") {
    const converted = convertBashToTool(updated, cwd);
    if (converted) {
      return converted;
    }
  }

  return sanitizeToolCall(updated, cwd, rawName);
}

function convertBashToTool(toolCall: UnifiedTranscriptMessage, cwd: string | null): UnifiedTranscriptMessage | null {
  if (toolCall.type !== "tool-call" || !toolCall.input) {
    return null;
  }

  const input = toolCall.input as Record<string, unknown>;
  const command = input.command;

  if (!Array.isArray(command) || command.length < 3) {
    return null;
  }

  // Check if it's a bash/zsh -lc command
  const shell = command[0];
  if ((shell !== "bash" && shell !== "zsh") || command[1] !== "-lc") {
    return null;
  }

  const cmdString = asString(command[2]);
  if (!cmdString) {
    return null;
  }

  // Try to parse as heredoc write: cat <<'EOF' > filename
  const writeMatch = cmdString.match(/^cat\s+<<'EOF'\s+>\s+(\S+)\s*\n([\s\S]*?)EOF$/);
  if (writeMatch) {
    const [, fileName, content] = writeMatch;
    const filePath = cwd ? relativizePath(`${cwd}/${fileName}`, cwd) : `./${fileName}`;

    return unifiedTranscriptMessageSchema.parse({
      ...toolCall,
      toolName: "Write",
      input: {
        file_path: filePath,
        content: content || "",
      },
      output: undefined, // Write tool has no meaningful output
    });
  }

  // Try to parse as cat read: cat filename
  const readMatch = cmdString.match(/^cat\s+(\S+)$/);
  if (readMatch) {
    const [, fileName] = readMatch;
    const filePath = cwd ? relativizePath(`${cwd}/${fileName}`, cwd) : `./${fileName}`;

    // Extract content from output if available
    let fileContent: string | undefined;
    if (toolCall.output && typeof toolCall.output === "object") {
      const outputRecord = toolCall.output as Record<string, unknown>;
      fileContent = asString(outputRecord.stdout) ?? undefined;
    }

    return unifiedTranscriptMessageSchema.parse({
      ...toolCall,
      toolName: "Read",
      input: {
        file_path: filePath,
      },
      output: fileContent,
    });
  }

  return null;
}

function sanitizeToolCall(
  toolCall: UnifiedTranscriptMessage,
  cwd: string | null,
  rawName: string | null,
): UnifiedTranscriptMessage {
  if (toolCall.type !== "tool-call") {
    return toolCall;
  }

  let { toolName, input, output } = toolCall;

  if (rawName === "shell") {
    toolName = "Bash";
    if (input && typeof input === "object") {
      const record = { ...(input as Record<string, unknown>) };
      if (typeof record.workdir === "string" && cwd) {
        record.workdir = relativizePath(record.workdir, cwd);
      }
      input = record;
    }
  }

  if (rawName === "apply_patch") {
    toolName = "Edit";
    if (input && typeof input === "object") {
      const record = { ...(input as Record<string, unknown>) };
      const filePath = asString(record.file_path);
      if (filePath && cwd) {
        record.file_path = relativizePath(filePath, cwd);
      }
      input = record;
    }
  }

  return unifiedTranscriptMessageSchema.parse({
    ...toolCall,
    toolName,
    input,
    output,
  });
}

function sanitizeShellOutput(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const output = asString(record.output ?? record.stdout);
  if (typeof record.stdout === "string") {
    result.stdout = record.stdout;
  } else if (output) {
    result.stdout = output;
  }
  const stderr = asString(record.stderr);
  if (stderr) {
    result.stderr = stderr;
  }
  const metadata =
    record.metadata && typeof record.metadata === "object" ? (record.metadata as Record<string, unknown>) : {};
  const exitCode = ensureNumber(metadata.exit_code ?? metadata.exitCode ?? record.exit_code ?? record.exitCode);
  if (Number.isFinite(exitCode)) {
    result.exitCode = exitCode;
  }
  const duration = ensureNumber(metadata.duration_seconds ?? metadata.durationSeconds);
  if (Number.isFinite(duration) && duration > 0) {
    result.durationSeconds = duration;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeApplyPatchOutput(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const output = asString(record.output);
  if (output) {
    result.message = output;
  }
  const metadata =
    record.metadata && typeof record.metadata === "object" ? (record.metadata as Record<string, unknown>) : null;
  if (metadata) {
    const exitCode = ensureNumber(metadata.exit_code ?? metadata.exitCode);
    if (Number.isFinite(exitCode)) {
      result.exitCode = exitCode;
    }
    const duration = ensureNumber(metadata.duration_seconds ?? metadata.durationSeconds);
    if (Number.isFinite(duration) && duration > 0) {
      result.durationSeconds = duration;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseApplyPatch(value: string, cwd: string | null): Record<string, unknown> {
  const lines = value.split(/\r?\n/);
  let filePath: string | null = null;
  const diffLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("*** ")) {
      const updateMatch = line.match(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/);
      if (updateMatch && updateMatch[1]) {
        filePath = updateMatch[1].trim();
      }
      continue;
    }
    diffLines.push(line);
  }

  const diff = diffLines.join("\n").trim();
  const result: Record<string, unknown> = {};
  if (filePath) {
    result.file_path = cwd ? relativizePath(filePath, cwd) : filePath;
  }
  if (diff) {
    result.diff = diff.endsWith("\n") ? diff : `${diff}\n`;
  }
  return result;
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
    return relative === "." ? "." : `./${relative}`;
  } catch {
    return target;
  }
}

function blendedTokenTotal(usage: TokenUsageAccumulator): number {
  const nonCached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return nonCached + usage.outputTokens + usage.reasoningOutputTokens;
}

function isIgnorableUserText(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return IGNORED_USER_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function derivePreview(userMessages: string[]): string | null {
  for (const text of userMessages) {
    const trimmed = text.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("<user_instructions>") || trimmed.startsWith("<environment_context>")) {
      continue;
    }
    return truncate(trimmed, 80);
  }
  return userMessages.length > 0 ? truncate(userMessages[0], 80) : null;
}

function buildGitContext(sessionMeta: CodexSessionMeta | null, cwd: string | null): UnifiedGitContext {
  const localCwd = cwd ?? sessionMeta?.cwd ?? null;

  if (!sessionMeta) {
    return unifiedGitContextSchema.parse({
      repo: null,
      branch: null,
      relativeCwd: null,
    });
  }

  const repo = parseRepositoryUrl(sessionMeta.git.repositoryUrl);
  const branch = sessionMeta.git.branch;
  const repoName = repo ? (repo.split("/").pop() ?? null) : null;
  const relativeCwd = deriveRelativeCwd(localCwd, repoName);

  return unifiedGitContextSchema.parse({
    repo,
    branch,
    relativeCwd: normalizeRelativeCwd(relativeCwd),
  });
}

function parseRepositoryUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const sshMatch = value.match(/git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`.replace(/\\/g, "/");
  }

  const httpsMatch = value.match(/https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`.replace(/\\/g, "/");
  }

  return null;
}

function deriveRelativeCwd(cwd: string | null, repoName: string | null): string | null {
  if (!cwd) {
    return null;
  }
  const normalized = cwd.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  if (repoName) {
    const idx = segments.lastIndexOf(repoName);
    if (idx >= 0) {
      const remainder = segments.slice(idx + 1).join("/");
      return remainder.length > 0 ? remainder : ".";
    }
  }

  return null;
}

function addMessage(
  candidate: UnifiedTranscriptMessage,
  messages: UnifiedTranscriptMessage[],
  seen: Set<string>,
): void {
  const signature = buildMessageSignature(candidate);
  if (signature && seen.has(signature)) {
    return;
  }

  const parsed = unifiedTranscriptMessageSchema.parse(candidate);
  messages.push(parsed);
  if (signature) {
    seen.add(signature);
  }
}

function buildMessageSignature(message: UnifiedTranscriptMessage): string | null {
  if ("text" in message && typeof message.text === "string") {
    return `${message.type}|${message.timestamp ?? ""}|${message.text}`;
  }
  if (message.type === "tool-call") {
    return `${message.type}|${message.timestamp ?? ""}|${message.id ?? ""}|${message.toolName ?? ""}`;
  }
  return null;
}

function normalizeToolName(rawName: string | null): string | null {
  if (!rawName) {
    return rawName;
  }
  return TOOL_NAMES[rawName] ?? rawName;
}

function compareIsoTimestamps(a: string, b: string): number {
  const timeA = Date.parse(a);
  const timeB = Date.parse(b);
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
    return 0;
  }
  return timeA === timeB ? 0 : timeA > timeB ? 1 : -1;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ensureNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? (value as number) : 0;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 1) {
    return value.slice(0, maxLength);
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function createFallbackId(timestamp: Date): string {
  return `codex-${timestamp.getTime()}`;
}

export type { UnifiedGitContext, UnifiedModelUsage, UnifiedTokenUsage, UnifiedTranscript, UnifiedTranscriptMessage };

function calculateCostFromUsage(
  modelName: string | null,
  usage: TokenUsageAccumulator,
  pricingData: Record<string, LiteLLMModelPricing> | undefined,
): number {
  if (!pricingData || !modelName) {
    return 0;
  }

  const pricing = resolvePricingForModel(modelName, pricingData);
  if (!pricing) {
    return 0;
  }

  const cost = calculateCostFromPricing(
    {
      input_tokens: Math.max(0, usage.inputTokens - usage.cachedInputTokens),
      output_tokens: usage.outputTokens + usage.reasoningOutputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: usage.cachedInputTokens,
    },
    pricing,
  );

  return cost;
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
