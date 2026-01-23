/**
 * Shared formatting utilities
 */

/**
 * Format a number with K suffix for thousands
 * 1000 → "1.0k", 500 → "500"
 */
export function formatCompactNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

/**
 * Parse and format model display names
 * - claude-opus-4-5-20251101 → Claude Opus 4.5
 * - claude-sonnet-4-20250514 → Claude Sonnet 4
 * - gpt-4-... → GPT-4
 */
export function getModelDisplayName(model: string | null): string {
  if (!model) return "Unknown";

  // Parse Claude model strings
  const match = model.match(/^claude-(?:(\d+)-(\d+)-)?(opus|sonnet|haiku)(?:-(\d+)(?:-(\d+))?)?-\d{8}$/);
  if (match) {
    const [, oldMajor, oldMinor, family, newMajor, newMinor] = match;
    const major = newMajor ?? oldMajor;
    const minor = newMinor ?? oldMinor;
    const version = minor ? `${major}.${minor}` : major;
    const familyName = family.charAt(0).toUpperCase() + family.slice(1);
    return `Claude ${familyName} ${version}`;
  }

  // Handle GPT models
  if (model.includes("gpt-4")) return "GPT-4";
  if (model.includes("gpt-3.5")) return "GPT-3.5";

  return model;
}

/**
 * Format agent source name for display
 */
export function getAgentDisplayName(agent: string): string {
  switch (agent.toLowerCase()) {
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex CLI";
    case "opencode":
      return "OpenCode";
    default:
      return agent;
  }
}
