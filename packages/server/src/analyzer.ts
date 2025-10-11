import type { TranscriptEvent, AnalysisResult } from '@aei/shared';

export function analyzeTranscript(events: TranscriptEvent[]): AnalysisResult {
  // Calculate metrics
  const metrics = {
    totalEvents: events.length,
    toolCalls: events.filter(e => e.type === 'tool_use').length,
    errors: events.filter(e => e.type === 'tool_result' && e.error).length,
    retries: detectRetries(events),
    contextOverflows: detectContextOverflows(events),
    duration: calculateDuration(events),
  };

  // Detect anti-patterns
  const antiPatterns: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
  }> = [];

  if (metrics.retries > 2) {
    antiPatterns.push({
      type: 'retry_loops',
      description: `Detected ${metrics.retries} retry attempts`,
      severity: metrics.retries > 5 ? 'high' : 'medium',
    });
  }

  if (metrics.contextOverflows > 0) {
    antiPatterns.push({
      type: 'context_overflow',
      description: `Detected ${metrics.contextOverflows} context overflow errors`,
      severity: 'high',
    });
  }

  const toolFailureRate =
    metrics.toolCalls > 0 ? metrics.errors / metrics.toolCalls : 0;

  if (toolFailureRate > 0.3) {
    antiPatterns.push({
      type: 'tool_failures',
      description: `Tool failure rate: ${(toolFailureRate * 100).toFixed(1)}%`,
      severity: 'medium',
    });
  }

  // Generate recommendations
  const recommendations = [];

  if (metrics.retries > 2) {
    recommendations.push(
      'Consider adding error handling or validation before tool calls'
    );
  }

  if (metrics.contextOverflows > 0) {
    recommendations.push(
      'Use Grep or Read with limits to avoid large file reads'
    );
  }

  if (toolFailureRate > 0.3) {
    recommendations.push(
      'Review tool usage patterns and check for common error causes'
    );
  }

  // Calculate health score (0-100)
  const healthScore = calculateHealthScore(metrics, antiPatterns);

  return {
    transcriptId: '', // Will be set by caller
    metrics,
    antiPatterns,
    recommendations,
    healthScore,
  };
}

function detectRetries(events: TranscriptEvent[]): number {
  let retries = 0;
  const toolUses = events.filter((e): e is Extract<TranscriptEvent, { type: 'tool_use' }> => e.type === 'tool_use');

  for (let i = 0; i < toolUses.length - 1; i++) {
    const current = toolUses[i];
    const next = toolUses[i + 1];

    // Same tool called twice in a row = likely a retry
    if (current.tool_name === next.tool_name) {
      retries++;
    }
  }

  return retries;
}

function detectContextOverflows(events: TranscriptEvent[]): number {
  return events.filter((e): e is Extract<TranscriptEvent, { type: 'tool_result' }> =>
    e.type === 'tool_result' &&
    e.error !== undefined &&
    (e.error.includes('context') ||
      e.error.includes('token limit') ||
      e.error.includes('too large'))
  ).length;
}

function calculateDuration(events: TranscriptEvent[]): number {
  if (events.length < 2) return 0;

  const first = new Date(events[0].timestamp).getTime();
  const last = new Date(events[events.length - 1].timestamp).getTime();

  return last - first;
}

function calculateHealthScore(
  metrics: AnalysisResult['metrics'],
  antiPatterns: AnalysisResult['antiPatterns']
): number {
  let score = 100;

  // Penalize retries
  score -= metrics.retries * 5;

  // Penalize errors
  score -= metrics.errors * 3;

  // Penalize context overflows
  score -= metrics.contextOverflows * 10;

  // Penalize anti-patterns
  antiPatterns.forEach(ap => {
    if (ap.severity === 'high') score -= 15;
    if (ap.severity === 'medium') score -= 10;
    if (ap.severity === 'low') score -= 5;
  });

  return Math.max(0, Math.min(100, score));
}
