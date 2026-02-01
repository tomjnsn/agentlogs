import { promises as fs } from "fs";
import { homedir } from "os";
import { basename, extname, join, resolve } from "path";
import type { TranscriptSource } from "./types";

export type { TranscriptSource };

export interface DiscoveryStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
}

export interface DiscoveredTranscript {
  id: string;
  source: TranscriptSource;
  path: string;
  timestamp: Date;
  preview: string | null;
  cwd: string | null;
  repoId: string | null;
  stats: DiscoveryStats | null;
}

export interface DiscoveryOptions {
  sources?: TranscriptSource[];
  cwd?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 100;
const PREVIEW_MAX_LENGTH = 80;

// Message filtering patterns (same as claudecode.ts)
const IGNORE_STATUS_MESSAGES = new Set([
  "[request interrupted by user]",
  "[request aborted by user]",
  "[request cancelled by user]",
]);

const COMMAND_ENVELOPE_PATTERN = /^<\/?(?:command|local)-[a-z-]+>/i;
const SHELL_PROMPT_PATTERN = /^[α-ωΑ-Ω]\s/i;
const SYSTEM_REMINDER_PATTERN = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

const NON_PROMPT_PREFIXES = [
  "npm ",
  "npm:",
  "npm error",
  "node:",
  "node.js",
  "error:",
  "fatal:",
  "warning:",
  "traceback (most recent call last):",
  "usage:",
  "hint:",
  "note:",
  "code:",
  "requirestack",
];

const DEFAULT_CLAUDE_HOME = join(homedir(), ".claude");
const DEFAULT_CODEX_HOME = join(homedir(), ".codex");
const DEFAULT_OPENCODE_STORAGE = join(homedir(), ".local", "share", "opencode", "storage");

/**
 * Discover Claude Code transcripts from ~/.claude/projects/
 */
export async function discoverClaudeCodeTranscripts(options?: { limit?: number }): Promise<DiscoveredTranscript[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const claudeHome = process.env.CLAUDE_HOME ?? DEFAULT_CLAUDE_HOME;
  const projectsRoot = join(claudeHome, "projects");

  if (!(await isDirectory(projectsRoot))) {
    return [];
  }

  // Phase 1: Collect file paths with mtimes (cheap)
  const fileCandidates: Array<{ path: string; id: string; mtime: Date }> = [];

  try {
    const projectEntries = await fs.readdir(projectsRoot, { withFileTypes: true });

    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory()) continue;

      const projectPath = join(projectsRoot, projectEntry.name);

      try {
        const files = await fs.readdir(projectPath, { withFileTypes: true });

        for (const file of files) {
          if (!file.isFile() || extname(file.name) !== ".jsonl") continue;

          const filePath = join(projectPath, file.name);
          const transcriptId = basename(file.name, ".jsonl");

          try {
            const stat = await fs.stat(filePath);
            fileCandidates.push({ path: filePath, id: transcriptId, mtime: stat.mtime });
          } catch {
            // Skip inaccessible files
          }
        }
      } catch {
        // Skip inaccessible project directories
      }
    }
  } catch {
    // Directory not accessible
  }

  // Sort by mtime descending - most recently modified first
  fileCandidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  // Phase 2: Only parse the top N candidates (mtime is usually close to actual timestamp)
  const parseCandidates = fileCandidates.slice(0, limit * 2);
  const allTranscripts: DiscoveredTranscript[] = [];

  for (const candidate of parseCandidates) {
    try {
      const info = await parseClaudeCodeTranscript(candidate.path);

      allTranscripts.push({
        id: candidate.id,
        source: "claude-code",
        path: candidate.path,
        timestamp: info.timestamp,
        preview: info.preview,
        cwd: info.cwd,
        repoId: null, // Skip expensive git lookup during discovery
        stats: info.stats,
      });
    } catch {
      // Skip invalid files
    }
  }

  // Sort by actual timestamp descending, then apply limit
  return allTranscripts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
}

/**
 * Discover Codex transcripts from ~/.codex/sessions/
 */
export async function discoverCodexTranscripts(options?: { limit?: number }): Promise<DiscoveredTranscript[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const codexHome = process.env.CODEX_HOME ?? DEFAULT_CODEX_HOME;
  const sessionsRoot = join(codexHome, "sessions");

  if (!(await isDirectory(sessionsRoot))) {
    return [];
  }

  const allTranscripts: DiscoveredTranscript[] = [];
  const files = await collectCodexFiles(sessionsRoot); // Already sorted by mtime desc

  // Only parse the top candidates (mtime is usually close to actual timestamp)
  const parseCandidates = files.slice(0, limit * 2);

  for (const filePath of parseCandidates) {
    try {
      const info = await parseCodexTranscript(filePath);
      if (!info) continue;

      allTranscripts.push({
        id: info.sessionId,
        source: "codex",
        path: filePath,
        timestamp: info.timestamp,
        preview: info.preview,
        cwd: info.cwd,
        repoId: null, // Skip expensive git lookup during discovery
        stats: info.stats,
      });
    } catch {
      // Skip invalid files
    }
  }

  // Sort by timestamp descending, then apply limit
  return allTranscripts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
}

/**
 * Discover OpenCode sessions from ~/.local/share/opencode/storage/
 */
export async function discoverOpenCodeSessions(options?: { limit?: number }): Promise<DiscoveredTranscript[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const storageRoot = process.env.OPENCODE_STORAGE ?? DEFAULT_OPENCODE_STORAGE;
  const sessionRoot = join(storageRoot, "session");

  if (!(await isDirectory(sessionRoot))) {
    return [];
  }

  const allTranscripts: DiscoveredTranscript[] = [];

  try {
    const projectDirs = await fs.readdir(sessionRoot, { withFileTypes: true });

    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;

      const projectPath = join(sessionRoot, projectDir.name);

      try {
        const files = await fs.readdir(projectPath, { withFileTypes: true });

        for (const file of files) {
          if (!file.isFile() || !file.name.endsWith(".json")) continue;

          const filePath = join(projectPath, file.name);

          try {
            const info = await parseOpenCodeSession(filePath);
            if (!info) continue;

            allTranscripts.push({
              id: info.sessionId,
              source: "opencode",
              path: filePath,
              timestamp: info.timestamp,
              preview: info.preview,
              cwd: info.cwd,
              repoId: null, // Skip expensive git lookup during discovery
              stats: info.stats,
            });
          } catch {
            // Skip invalid files
          }
        }
      } catch {
        // Skip inaccessible project directories
      }
    }
  } catch {
    // Directory not accessible
  }

  // Sort by timestamp descending, then apply limit
  return allTranscripts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
}

/**
 * Discover transcripts from all sources
 */
export async function discoverAllTranscripts(options?: DiscoveryOptions): Promise<DiscoveredTranscript[]> {
  const sources = options?.sources ?? ["claude-code", "codex", "opencode"];
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const cwdFilter = options?.cwd ? resolve(options.cwd) : null;

  // Collect enough from each source to ensure we get the most recent across all
  const perSourceLimit = limit * 3;

  // Discover from each source in parallel
  const discoveries = await Promise.all([
    sources.includes("claude-code") ? discoverClaudeCodeTranscripts({ limit: perSourceLimit }) : [],
    sources.includes("codex") ? discoverCodexTranscripts({ limit: perSourceLimit }) : [],
    sources.includes("opencode") ? discoverOpenCodeSessions({ limit: perSourceLimit }) : [],
  ]);

  let allTranscripts: DiscoveredTranscript[] = [];
  for (const transcripts of discoveries) {
    allTranscripts.push(...transcripts);
  }

  // Filter out transcripts with empty previews (no meaningful user messages)
  allTranscripts = allTranscripts.filter((t) => t.preview && t.preview.trim().length > 0);

  // Filter by cwd if specified
  if (cwdFilter) {
    allTranscripts = allTranscripts.filter((t) => {
      if (!t.cwd) return false;
      const normalizedCwd = resolve(t.cwd);
      return normalizedCwd.startsWith(cwdFilter) || cwdFilter.startsWith(normalizedCwd);
    });
  }

  // Sort by timestamp descending and apply limit
  return allTranscripts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
}

// --- Helper functions ---

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function truncatePreview(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= PREVIEW_MAX_LENGTH) return cleaned;
  return cleaned.slice(0, PREVIEW_MAX_LENGTH - 1) + "…";
}

// --- Claude Code parsing ---

interface ClaudeCodeTranscriptInfo {
  timestamp: Date;
  cwd: string | null;
  preview: string | null;
  stats: DiscoveryStats | null;
}

const HEAD_READ_SIZE = 50 * 1024; // 50KB for cwd and preview
const TAIL_READ_SIZE = 20 * 1024; // 20KB for latest timestamp

/**
 * Fast parse - only reads parts of the file needed for discovery.
 * Reads first 50KB for cwd/preview, and last 20KB for timestamp.
 * Does NOT calculate stats (too slow for discovery).
 */
async function parseClaudeCodeTranscript(filePath: string): Promise<ClaudeCodeTranscriptInfo> {
  const fileHandle = await fs.open(filePath, "r");
  try {
    const stat = await fileHandle.stat();
    const fileSize = stat.size;

    let cwd: string | null = null;
    let preview: string | null = null;
    let latestTimestamp: Date | null = null;

    // Read head of file for cwd and preview
    const headBuffer = Buffer.alloc(Math.min(HEAD_READ_SIZE, fileSize));
    await fileHandle.read(headBuffer, 0, headBuffer.length, 0);
    const headContent = headBuffer.toString("utf8");

    for (const line of headContent.split(/\r?\n/)) {
      if (!line.trim()) continue;
      // Stop if line is incomplete (truncated)
      if (!line.endsWith("}")) break;

      try {
        const record = JSON.parse(line) as Record<string, unknown>;

        // Extract cwd from first record that has it
        if (!cwd && typeof record.cwd === "string") {
          cwd = record.cwd;
        }

        // Track timestamps as we go
        if (typeof record.timestamp === "string") {
          const ts = new Date(record.timestamp);
          if (!Number.isNaN(ts.getTime())) {
            if (!latestTimestamp || ts > latestTimestamp) {
              latestTimestamp = ts;
            }
          }
        }

        // Skip sidechain and meta messages for preview
        if (record.isSidechain || record.isMeta) continue;

        // Extract preview from first real user message
        if (!preview && record.type === "user") {
          const message = record.message as Record<string, unknown> | undefined;
          const msgContent = message?.content;

          // Skip tool results
          if (record.toolUseResult || record.tool_use_result) continue;

          const text = extractTextFromContent(msgContent);
          if (text) {
            const cleaned = cleanUserMessage(text);
            if (cleaned) {
              preview = truncatePreview(cleaned);
            }
          }
        }

        // Stop early if we have what we need from head
        if (cwd && preview) break;
      } catch {
        continue;
      }
    }

    // Read tail of file for latest timestamp
    if (fileSize > HEAD_READ_SIZE) {
      const tailOffset = Math.max(0, fileSize - TAIL_READ_SIZE);
      const tailBuffer = Buffer.alloc(Math.min(TAIL_READ_SIZE, fileSize - tailOffset));
      await fileHandle.read(tailBuffer, 0, tailBuffer.length, tailOffset);
      const tailContent = tailBuffer.toString("utf8");

      // Find complete lines (skip first partial line)
      const lines = tailContent.split(/\r?\n/);
      if (tailOffset > 0 && lines.length > 0) {
        lines.shift(); // Remove potentially incomplete first line
      }

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const record = JSON.parse(line) as Record<string, unknown>;

          if (typeof record.timestamp === "string") {
            const ts = new Date(record.timestamp);
            if (!Number.isNaN(ts.getTime())) {
              if (!latestTimestamp || ts > latestTimestamp) {
                latestTimestamp = ts;
              }
            }
          }
        } catch {
          continue;
        }
      }
    }

    return {
      timestamp: latestTimestamp ?? new Date(0),
      cwd,
      preview,
      stats: null, // Not calculated in fast discovery mode
    };
  } finally {
    await fileHandle.close();
  }
}

function extractTextFromContent(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object") {
        const partObj = part as Record<string, unknown>;
        // Skip tool results
        if (partObj.type === "tool_result") continue;
        if (partObj.type === "text" && typeof partObj.text === "string") {
          return partObj.text;
        }
      }
    }
  }

  return null;
}

function cleanUserMessage(text: string): string | null {
  // Strip system reminders first
  const withoutReminders = text.replace(SYSTEM_REMINDER_PATTERN, "");

  // Extract meaningful lines (same logic as claudecode.ts extractMeaningfulLines)
  const lines: string[] = [];
  for (const rawLine of withoutReminders.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();

    // Skip status messages
    if (IGNORE_STATUS_MESSAGES.has(lower)) continue;

    // Skip command envelopes (e.g., <command-message>, <local-command-stdout>)
    if (COMMAND_ENVELOPE_PATTERN.test(trimmed)) continue;

    // Skip shell prompts (Greek letters like α)
    if (SHELL_PROMPT_PATTERN.test(trimmed)) continue;

    // Skip non-prompt prefixes (error messages, npm output, etc.)
    if (NON_PROMPT_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      // Unless it contains a question mark or prompt cue
      if (!trimmed.includes("?") && !hasPromptCue(lower)) continue;
    }

    // Skip lines without letters or digits
    if (!/[a-z]/i.test(trimmed) && !/\d/.test(trimmed)) continue;

    lines.push(trimmed);
  }

  if (lines.length === 0) return null;

  // Collapse whitespace and return first few lines
  return lines.slice(0, 3).join(" ").replace(/\s+/g, " ").trim() || null;
}

function hasPromptCue(lower: string): boolean {
  const cues = ["can you", "could you", "please", "help", "how do", "what is", "why", "fix", "add", "create", "update"];
  return cues.some((cue) => lower.includes(cue));
}

// --- Codex parsing ---

interface CodexTranscriptInfo {
  sessionId: string;
  timestamp: Date;
  cwd: string | null;
  preview: string | null;
  stats: DiscoveryStats | null;
}

async function collectCodexFiles(sessionsRoot: string): Promise<string[]> {
  const files: Array<{ path: string; mtime: Date }> = [];

  async function scanDir(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          await scanDir(fullPath, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          const stat = await fs.stat(fullPath);
          files.push({ path: fullPath, mtime: stat.mtime });
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await scanDir(sessionsRoot, 0);

  // Sort by mtime descending
  files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return files.map((f) => f.path);
}

/**
 * Fast parse for Codex - only reads first 50KB for metadata and last 20KB for timestamp.
 */
async function parseCodexTranscript(filePath: string): Promise<CodexTranscriptInfo | null> {
  const fileHandle = await fs.open(filePath, "r");
  try {
    const stat = await fileHandle.stat();
    const fileSize = stat.size;

    let sessionId: string | null = null;
    let latestTimestamp: Date | null = null;
    let cwd: string | null = null;
    let preview: string | null = null;

    // Read head of file for session_meta and preview
    const headBuffer = Buffer.alloc(Math.min(HEAD_READ_SIZE, fileSize));
    await fileHandle.read(headBuffer, 0, headBuffer.length, 0);
    const headContent = headBuffer.toString("utf8");

    for (const line of headContent.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (!line.endsWith("}")) break; // Stop at incomplete line

      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        const recordTimestamp = record.timestamp as string | undefined;
        const type = record.type as string | undefined;
        const payload = record.payload as Record<string, unknown> | undefined;

        // Track timestamps
        if (recordTimestamp) {
          const ts = new Date(recordTimestamp);
          if (!Number.isNaN(ts.getTime())) {
            if (!latestTimestamp || ts > latestTimestamp) {
              latestTimestamp = ts;
            }
          }
        }

        if (!payload) continue;

        // Parse session_meta
        if (type === "session_meta") {
          sessionId = (payload.id as string) ?? null;
          cwd = (payload.cwd as string) ?? null;
        }

        // Parse user message for preview
        if (type === "event_msg" && payload.type === "user_message" && !preview) {
          const message = payload.message as string | undefined;
          if (message) {
            preview = truncatePreview(message);
          }
        }

        // Stop early if we have what we need
        if (sessionId && cwd && preview) break;
      } catch {
        continue;
      }
    }

    // Read tail for latest timestamp
    if (fileSize > HEAD_READ_SIZE) {
      const tailOffset = Math.max(0, fileSize - TAIL_READ_SIZE);
      const tailBuffer = Buffer.alloc(Math.min(TAIL_READ_SIZE, fileSize - tailOffset));
      await fileHandle.read(tailBuffer, 0, tailBuffer.length, tailOffset);
      const tailContent = tailBuffer.toString("utf8");

      const lines = tailContent.split(/\r?\n/);
      if (tailOffset > 0 && lines.length > 0) {
        lines.shift(); // Remove potentially incomplete first line
      }

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          const recordTimestamp = record.timestamp as string | undefined;

          if (recordTimestamp) {
            const ts = new Date(recordTimestamp);
            if (!Number.isNaN(ts.getTime())) {
              if (!latestTimestamp || ts > latestTimestamp) {
                latestTimestamp = ts;
              }
            }
          }
        } catch {
          continue;
        }
      }
    }

    if (!sessionId) return null;

    return {
      sessionId,
      timestamp: latestTimestamp ?? new Date(0),
      cwd,
      preview,
      stats: null, // Not calculated in fast discovery mode
    };
  } finally {
    await fileHandle.close();
  }
}

// --- OpenCode parsing ---

interface OpenCodeSessionInfo {
  sessionId: string;
  timestamp: Date;
  cwd: string | null;
  preview: string | null;
  stats: DiscoveryStats | null;
}

async function parseOpenCodeSession(filePath: string): Promise<OpenCodeSessionInfo | null> {
  const content = await fs.readFile(filePath, "utf8");

  let session: Record<string, unknown>;
  try {
    session = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  const sessionId = session.id as string | undefined;
  if (!sessionId) return null;

  // Skip subagent sessions
  if (session.parentID) return null;

  const directory = session.directory as string | undefined;
  const title = session.title as string | undefined;

  const timeObj = session.time as Record<string, unknown> | undefined;
  const createdMs = timeObj?.created as number | undefined;
  const updatedMs = timeObj?.updated as number | undefined;

  const timestamp = updatedMs ? new Date(updatedMs) : createdMs ? new Date(createdMs) : new Date(0);

  // Extract stats from summary if available
  const summary = session.summary as Record<string, unknown> | undefined;
  let stats: DiscoveryStats | null = null;

  if (summary) {
    const additions = typeof summary.additions === "number" ? summary.additions : 0;
    const deletions = typeof summary.deletions === "number" ? summary.deletions : 0;
    const files = typeof summary.files === "number" ? summary.files : 0;

    if (additions > 0 || deletions > 0 || files > 0) {
      stats = {
        filesChanged: files,
        linesAdded: additions,
        linesRemoved: deletions,
        linesModified: 0, // OpenCode doesn't track this separately
      };
    }
  }

  return {
    sessionId,
    timestamp,
    cwd: directory ?? null,
    preview: title ? truncatePreview(title) : null,
    stats,
  };
}
