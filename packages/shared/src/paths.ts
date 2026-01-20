import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, resolve } from "path";

/**
 * Finds the root directory of the monorepo by traversing up looking for
 * package.json with "workspaces" field.
 *
 * Search order:
 * 1. If VI_CLI_PATH is set (dev mode), search from that path
 * 2. Otherwise, search from process.cwd()
 *
 * @returns Absolute path to the monorepo root, or null if not found
 */
export function getRepoRoot(): string | null {
  // In dev mode, VI_CLI_PATH points to the CLI entry point in the monorepo
  // It may be a command string like "bun /path/to/index.ts" - extract the path
  const viCliPath = process.env.VI_CLI_PATH;
  let startPath = viCliPath;
  if (startPath?.startsWith("bun ")) {
    startPath = startPath.slice(4);
  }
  let currentDir = startPath ? dirname(startPath) : process.cwd();
  const maxDepth = 10; // Prevent infinite loops
  let depth = 0;

  while (depth < maxDepth) {
    const packageJsonPath = resolve(currentDir, "package.json");

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        // Check if this is the monorepo root (has workspaces field)
        if (packageJson.workspaces) {
          return currentDir;
        }
      } catch {
        // Continue searching if package.json is invalid
      }
    }

    // Move up one directory
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }
    currentDir = parentDir;
    depth++;
  }

  return null;
}

/**
 * Gets the path to the logs directory in the monorepo root
 *
 * @returns Absolute path to logs directory, or null if not in monorepo
 */
export function getLogsDir(): string | null {
  const root = getRepoRoot();
  return root ? resolve(root, "logs") : null;
}

/**
 * Gets the path to the dev.log file in the monorepo root
 *
 * @returns Absolute path to dev.log file, or null if not in monorepo
 */
export function getDevLogPath(): string | null {
  const logsDir = getLogsDir();
  return logsDir ? resolve(logsDir, "dev.log") : null;
}

/**
 * Formats a directory path with tilde (~) if it's inside a user's home directory.
 * Uses pattern-based detection to handle paths from any user (e.g., fixtures in CI).
 *
 * @param absolutePath - Absolute path to format
 * @returns Path with tilde if inside a home directory, otherwise absolute path
 */
export function formatCwdWithTilde(absolutePath: string): string {
  // First try exact home directory match for current user
  const home = homedir();
  if (absolutePath.startsWith(home)) {
    return absolutePath.replace(home, "~");
  }

  // Fall back to pattern-based detection for cross-user paths (e.g., in CI)
  // Matches /Users/<username>/ on macOS or /home/<username>/ on Linux
  const homePattern = /^(\/Users\/[^/]+|\/home\/[^/]+)/;
  return absolutePath.replace(homePattern, "~");
}

/**
 * Normalizes relative_cwd by converting "." to empty string
 * This ensures consistent representation of repo root
 *
 * @param relativeCwd - The relative cwd from git context
 * @returns Empty string for "." or null, otherwise the original value
 */
export function normalizeRelativeCwd(relativeCwd: string | null): string {
  if (relativeCwd === "." || relativeCwd === null) {
    return "";
  }
  return relativeCwd;
}

/**
 * Recursively relativizes all absolute paths in a value that start with the given cwd.
 * Works on strings, arrays, and plain objects (recursive).
 *
 * @param value - The value to process (string, array, object, or primitive)
 * @param cwd - The current working directory to relativize against
 * @returns The value with all matching absolute paths converted to relative paths
 */
export function relativizePaths(value: unknown, cwd: string): unknown {
  if (!cwd) {
    return value;
  }

  // Normalize cwd to ensure it ends with /
  const normalizedCwd = cwd.endsWith("/") ? cwd : `${cwd}/`;
  const cwdWithoutSlash = normalizedCwd.slice(0, -1);

  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  const processValue = (v: unknown): unknown => {
    if (typeof v === "string") {
      // Replace all occurrences of the cwd prefix in the string
      if (v.includes(normalizedCwd)) {
        return v.replaceAll(normalizedCwd, "./");
      }
      // Also handle the case where cwd appears without trailing slash (exact match or at end)
      if (v.includes(cwdWithoutSlash)) {
        return v.replaceAll(cwdWithoutSlash, ".");
      }
      return v;
    }
    if (Array.isArray(v)) {
      return v.map(processValue);
    }
    if (isPlainObject(v)) {
      const result: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        result[k] = processValue(val);
      }
      return result;
    }
    return v;
  };

  return processValue(value);
}
