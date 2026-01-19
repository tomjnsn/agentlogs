import { SECRET_PATTERNS } from "./secret-patterns";

const DEFAULT_MASK_CHAR = "*";
const PRESERVE_CHARS = new Set(["\n", "\r", "\t", '"', "'", ":", ",", "{", "}", "[", "]", "\\"]);

// Compile patterns once at module load
const COMPILED_PATTERNS: RegExp[] = [];

for (const { regex } of SECRET_PATTERNS) {
  try {
    // Handle (?i) case-insensitive flag (not standard JS)
    let pattern = regex;
    let flags = "g";
    if (pattern.startsWith("(?i)")) {
      pattern = pattern.slice(4);
      flags = "gi";
    }
    COMPILED_PATTERNS.push(new RegExp(pattern, flags));
  } catch {
    // Skip invalid patterns silently
  }
}

/**
 * Redact secrets while preserving string length (keeps JSON structure valid)
 */
export function redactSecretsPreserveLength(content: string, placeholder = DEFAULT_MASK_CHAR): string {
  const maskChar = placeholder.length > 0 ? placeholder[0] : DEFAULT_MASK_CHAR;
  let result = content;
  for (const regex of COMPILED_PATTERNS) {
    result = result.replace(regex, (match) =>
      Array.from(match, (char) => (PRESERVE_CHARS.has(char) ? char : maskChar)).join(""),
    );
  }
  return result;
}

/**
 * Recursively redact secrets from all string values (length-preserving)
 */
export function redactSecretsDeep<T>(value: T): T {
  if (typeof value === "string") {
    return redactSecretsPreserveLength(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsDeep(item)) as T;
  }

  // Preserve Date objects
  if (value instanceof Date) {
    return value;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = redactSecretsDeep(val);
    }
    return result as T;
  }

  return value;
}
