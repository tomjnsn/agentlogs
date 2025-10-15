import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";

/**
 * Finds the root directory of the monorepo by traversing up from current directory
 * looking for package.json with "workspaces" field
 *
 * @returns Absolute path to the monorepo root
 * @throws Error if monorepo root cannot be found
 */
export function getRepoRoot(): string {
  let currentDir = process.cwd();
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

  throw new Error("Could not find monorepo root (no package.json with workspaces field found)");
}

/**
 * Gets the path to the logs directory in the monorepo root
 *
 * @returns Absolute path to logs directory
 */
export function getLogsDir(): string {
  return resolve(getRepoRoot(), "logs");
}

/**
 * Gets the path to the dev.log file in the monorepo root
 *
 * @returns Absolute path to dev.log file
 */
export function getDevLogPath(): string {
  return resolve(getLogsDir(), "dev.log");
}
