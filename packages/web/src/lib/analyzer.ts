import type { AnalysisResult, UnifiedTranscript, UnifiedTranscriptMessage } from "@vibeinsights/shared";

const CONTEXT_ERROR_PATTERNS = [/context/i, /token limit/i, /too large/i];

export function analyzeTranscript(transcript: UnifiedTranscript): AnalysisResult {
  const messages = transcript.messages ?? [];

  const metrics = {
    totalEvents: messages.length,
    toolCalls: countToolCalls(messages),
    errors: countToolErrors(messages),
    retries: detectRetries(messages),
    contextOverflows: detectContextOverflows(messages),
    duration: calculateDuration(messages),
  } satisfies AnalysisResult["metrics"];

  const antiPatterns = deriveAntiPatterns(metrics, transcript);
  const recommendations = deriveRecommendations(metrics, antiPatterns, transcript);
  const healthScore = calculateHealthScore(metrics, antiPatterns);

  return {
    transcriptId: transcript.id,
    metrics,
    antiPatterns,
    recommendations,
    healthScore,
  };
}

function countToolCalls(messages: UnifiedTranscriptMessage[]): number {
  return messages.filter((message) => message.type === "tool-call").length;
}

function countToolErrors(messages: UnifiedTranscriptMessage[]): number {
  return messages.filter((message) => message.type === "tool-call" && isToolError(message)).length;
}

function isToolError(message: Extract<UnifiedTranscriptMessage, { type: "tool-call" }>): boolean {
  if (message.isError === true) return true;
  if (typeof message.error === "string" && message.error.trim().length > 0) return true;

  const output = message.output as Record<string, unknown> | undefined;
  const error = output && (output.error ?? output.message ?? output.status);
  return typeof error === "string" && error.trim().length > 0;
}

function detectRetries(messages: UnifiedTranscriptMessage[]): number {
  let retries = 0;
  const toolCalls = messages.filter(
    (message): message is Extract<UnifiedTranscriptMessage, { type: "tool-call" } & { toolName?: string | null }> =>
      message.type === "tool-call",
  );

  for (let i = 0; i < toolCalls.length - 1; i++) {
    const current = toolCalls[i];
    const next = toolCalls[i + 1];

    if (current.toolName && current.toolName === next.toolName) {
      retries++;
    }
  }

  return retries;
}

function detectContextOverflows(messages: UnifiedTranscriptMessage[]): number {
  return messages.filter((message) => {
    if (message.type !== "tool-call") return false;

    const errorCandidates: Array<unknown> = [message.error, message.output, message.input];
    return errorCandidates.some((candidate) => {
      if (typeof candidate === "string") {
        return CONTEXT_ERROR_PATTERNS.some((pattern) => pattern.test(candidate));
      }

      if (candidate && typeof candidate === "object") {
        return Object.values(candidate as Record<string, unknown>).some((value) =>
          typeof value === "string" ? CONTEXT_ERROR_PATTERNS.some((pattern) => pattern.test(value)) : false,
        );
      }

      return false;
    });
  }).length;
}

function calculateDuration(messages: UnifiedTranscriptMessage[]): number {
  const timestamps = messages
    .map((message) => (typeof message.timestamp === "string" ? Date.parse(message.timestamp) : NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (timestamps.length < 2) {
    return 0;
  }

  return timestamps[timestamps.length - 1] - timestamps[0];
}

function deriveAntiPatterns(
  metrics: AnalysisResult["metrics"],
  transcript: UnifiedTranscript,
): AnalysisResult["antiPatterns"] {
  const antiPatterns: AnalysisResult["antiPatterns"] = [];

  if (metrics.retries > 2) {
    antiPatterns.push({
      type: "retry_loops",
      description: `Detected ${metrics.retries} consecutive tool retries`,
      severity: metrics.retries > 5 ? "high" : "medium",
    });
  }

  if (metrics.contextOverflows > 0) {
    antiPatterns.push({
      type: "context_overflow",
      description: `Detected ${metrics.contextOverflows} context overflow errors`,
      severity: "high",
    });
  }

  const toolFailureRate = metrics.toolCalls > 0 ? metrics.errors / metrics.toolCalls : 0;
  if (toolFailureRate > 0.3 && metrics.toolCalls >= 3) {
    antiPatterns.push({
      type: "tool_failures",
      description: `Tool failure rate ${(toolFailureRate * 100).toFixed(1)}% across ${metrics.toolCalls} calls`,
      severity: toolFailureRate > 0.5 ? "high" : "medium",
    });
  }

  if (transcript.messages.some((message) => message.type === "thinking")) {
    const longThinking = transcript.messages.filter(
      (message) => message.type === "thinking" && (message.text?.length ?? 0) > 400,
    ).length;

    if (longThinking > 0) {
      antiPatterns.push({
        type: "extended_reasoning",
        description: `Detected ${longThinking} extended thinking segments (>400 chars)`,
        severity: longThinking > 2 ? "medium" : "low",
      });
    }
  }

  return antiPatterns;
}

function deriveRecommendations(
  metrics: AnalysisResult["metrics"],
  antiPatterns: AnalysisResult["antiPatterns"],
  transcript: UnifiedTranscript,
): string[] {
  const recommendations: string[] = [];
  const toolFailureRate = metrics.toolCalls > 0 ? metrics.errors / metrics.toolCalls : 0;

  if (metrics.retries > 2) {
    recommendations.push("Review why the assistant repeated the same tool; consider improving tool feedback.");
  }

  if (metrics.contextOverflows > 0) {
    recommendations.push("Break large tasks into smaller chunks to avoid context overflows.");
  }

  if (toolFailureRate > 0.3) {
    recommendations.push("Audit tool implementations and ensure proper error handling for frequent failures.");
  }

  if (antiPatterns.some((pattern) => pattern.type === "extended_reasoning")) {
    recommendations.push("Consider capping reasoning output or using short responses to stay within limits.");
  }

  if (transcript.tokenUsage.totalTokens > 120_000) {
    recommendations.push("Large token usage detected; evaluate opportunities to trim prompts or leverage caching.");
  }

  return recommendations;
}

function calculateHealthScore(
  metrics: AnalysisResult["metrics"],
  antiPatterns: AnalysisResult["antiPatterns"],
): number {
  let score = 100;

  score -= metrics.retries * 5;
  score -= metrics.errors * 3;
  score -= metrics.contextOverflows * 10;

  antiPatterns.forEach((pattern) => {
    if (pattern.severity === "high") score -= 15;
    if (pattern.severity === "medium") score -= 10;
    if (pattern.severity === "low") score -= 5;
  });

  return Math.max(0, Math.min(100, score));
}
