import * as fs from "fs/promises";
import * as path from "path";

/**
 * Parse a git remote URL to extract host and repo path.
 * Supports SSH (git@host:owner/repo.git) and HTTPS (https://host/owner/repo.git) formats.
 * Returns format: "host/owner/repo" (e.g., "github.com/owner/repo")
 */
export function parseGitRemoteUrl(url: string): string | null {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return null;
}

/**
 * Locate the git root directory by walking up from the start directory.
 * Returns the path to the git root, or null if not found.
 */
export async function locateGitRoot(start: string): Promise<string | null> {
  let current = path.resolve(start);
  const { root } = path.parse(current);

  while (true) {
    const gitDir = path.join(current, ".git");
    try {
      const stats = await fs.stat(gitDir);
      if (stats.isDirectory() || stats.isFile()) {
        return current;
      }
    } catch {
      // continue
    }

    if (current === root) {
      return null;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Read the origin remote URL from .git/config
 */
export async function readGitRemoteUrl(repoRoot: string): Promise<string | null> {
  try {
    const configPath = path.join(repoRoot, ".git", "config");
    const configContent = await fs.readFile(configPath, "utf8");

    // Look for remote "origin" url
    const remoteMatch = configContent.match(/\[remote "origin"\]\s+url\s*=\s*(.+)/i);
    if (!remoteMatch || !remoteMatch[1]) {
      return null;
    }

    return remoteMatch[1].trim();
  } catch {
    return null;
  }
}

/**
 * Get the repo ID from a git root directory.
 * Returns format: "host/owner/repo" (e.g., "github.com/owner/repo")
 */
export async function getRepoIdFromGitRoot(repoRoot: string): Promise<string | null> {
  const url = await readGitRemoteUrl(repoRoot);
  if (!url) {
    return null;
  }
  return parseGitRemoteUrl(url);
}

/**
 * Get the repo ID from a working directory by locating git root and reading remote.
 * Returns format: "host/owner/repo" (e.g., "github.com/owner/repo")
 */
export async function getRepoId(cwd?: string): Promise<string | null> {
  const targetDir = cwd ?? process.cwd();

  const repoRoot = await locateGitRoot(targetDir);
  if (!repoRoot) {
    return null;
  }

  return getRepoIdFromGitRoot(repoRoot);
}

/**
 * Read the current branch from .git/HEAD
 */
export async function readGitBranch(repoRoot: string, fallback?: string): Promise<string | null> {
  try {
    const headPath = path.join(repoRoot, ".git", "HEAD");
    const headContent = await fs.readFile(headPath, "utf8");
    const trimmed = headContent.trim();
    if (trimmed.startsWith("ref:")) {
      const ref = trimmed.slice(4).trim();
      const parts = ref.split("/");
      return parts[parts.length - 1] ?? fallback ?? null;
    }
    return trimmed || fallback || null;
  } catch {
    return fallback ?? null;
  }
}
