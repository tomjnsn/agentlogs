/**
 * Parse model strings and return a human-friendly display name.
 *
 * Handles formats like:
 * - anthropic/claude-opus-4-5-20251101 → Claude Opus 4.5
 * - anthropic/claude-sonnet-4-20250514 → Claude Sonnet 4
 * - anthropic/claude-3-5-haiku-20241022 → Claude Haiku 3.5
 * - claude-opus-4-5-20251101 → Claude Opus 4.5 (without provider prefix)
 * - openai/gpt-5.2-codex → GPT-5.2-Codex
 */
export function getModelDisplayName(model: string | null | undefined): string {
  if (!model) return "";

  // Strip provider prefix if present (e.g., "anthropic/claude-...")
  const modelWithoutProvider = model.includes("/") ? model.split("/").slice(1).join("/") : model;

  // Try to match Claude models
  const claudeMatch = modelWithoutProvider.match(
    /^claude-(?:(\d+)-(\d+)-)?(opus|sonnet|haiku)(?:-(\d+)(?:-(\d+))?)?-\d{8}$/,
  );
  if (claudeMatch) {
    const [, oldMajor, oldMinor, family, newMajor, newMinor] = claudeMatch;
    const major = newMajor ?? oldMajor;
    const minor = newMinor ?? oldMinor;
    const version = minor ? `${major}.${minor}` : major;
    const familyName = family.charAt(0).toUpperCase() + family.slice(1);
    return `Claude ${familyName} ${version}`;
  }

  // Try to match GPT-Codex models (e.g., gpt-5.2-codex, gpt-5-codex)
  const gptCodexMatch = modelWithoutProvider.match(/^gpt-([\d.]+)-codex$/i);
  if (gptCodexMatch) {
    const version = gptCodexMatch[1];
    return `GPT-${version}-Codex`;
  }

  // Try to match base GPT models (e.g., gpt-5.2, gpt-5)
  const gptMatch = modelWithoutProvider.match(/^gpt-([\d.]+)$/i);
  if (gptMatch) {
    const version = gptMatch[1];
    return `GPT-${version}`;
  }

  // Try to match Gemini models (e.g., gemini-3-preview, gemini-2.5-pro)
  const geminiMatch = modelWithoutProvider.match(/^gemini-([\d.]+)(?:-(.+))?$/i);
  if (geminiMatch) {
    const version = geminiMatch[1];
    const suffix = geminiMatch[2];
    if (suffix) {
      const suffixName = suffix.charAt(0).toUpperCase() + suffix.slice(1);
      return `Gemini ${version} ${suffixName}`;
    }
    return `Gemini ${version}`;
  }

  return modelWithoutProvider;
}
