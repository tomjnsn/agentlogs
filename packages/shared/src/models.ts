/**
 * Parse model strings and return a human-friendly display name.
 *
 * Handles formats like:
 * - anthropic/claude-opus-4-5-20251101 → Claude Opus 4.5
 * - anthropic/claude-sonnet-4-20250514 → Claude Sonnet 4
 * - anthropic/claude-3-5-haiku-20241022 → Claude Haiku 3.5
 * - claude-opus-4-5-20251101 → Claude Opus 4.5 (without provider prefix)
 */
export function getModelDisplayName(model: string | null | undefined): string {
  if (!model) return "";

  // Strip provider prefix if present (e.g., "anthropic/claude-...")
  const modelWithoutProvider = model.includes("/") ? model.split("/").slice(1).join("/") : model;

  const match = modelWithoutProvider.match(/^claude-(?:(\d+)-(\d+)-)?(opus|sonnet|haiku)(?:-(\d+)(?:-(\d+))?)?-\d{8}$/);
  if (!match) return modelWithoutProvider;

  const [, oldMajor, oldMinor, family, newMajor, newMinor] = match;
  const major = newMajor ?? oldMajor;
  const minor = newMinor ?? oldMinor;
  const version = minor ? `${major}.${minor}` : major;
  const familyName = family.charAt(0).toUpperCase() + family.slice(1);

  return `Claude ${familyName} ${version}`;
}
