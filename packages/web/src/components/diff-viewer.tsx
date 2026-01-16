import { File, PatchDiff } from "@pierre/diffs/react";
import { FilePlus, Pencil, SquareTerminal } from "lucide-react";
import { Component, type ReactNode } from "react";

// Error boundary to catch PatchDiff rendering errors
class DiffErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface DiffViewerProps {
  filePath: string;
  diff: string;
  lineOffset?: number;
  className?: string;
}

/**
 * Compute diff statistics from a diff string
 */
function computeDiffStats(diff: string): { added: number; removed: number; modified: number } {
  const lines = diff.split("\n");
  let added = 0;
  let removed = 0;

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed++;
    }
  }

  // If there are both additions and removals, some are likely modifications
  const modified = Math.min(added, removed);

  return { added, removed, modified };
}

/**
 * Determine if this is a new file creation (all additions, no removals)
 */
function isNewFile(diff: string): boolean {
  const lines = diff.split("\n");
  for (const line of lines) {
    if (line.startsWith("-") && !line.startsWith("---")) {
      return false;
    }
  }
  return true;
}

/**
 * Convert a simple diff string (lines starting with +/-/space) to a proper unified diff patch format
 */
function convertToPatchFormat(filePath: string, diff: string, lineOffset: number = 1): string {
  const lines = diff.split("\n");

  // Filter to valid diff lines: +, -, or space (context)
  // Also include lines that don't start with these but aren't empty (treat as context)
  const diffLines: string[] = [];
  let additions = 0;
  let deletions = 0;
  let context = 0;

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      diffLines.push(line);
      additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      diffLines.push(line);
      deletions++;
    } else if (line.startsWith(" ")) {
      // Context line
      diffLines.push(line);
      context++;
    } else if (line.length > 0 && !line.startsWith("@@") && !line.startsWith("---") && !line.startsWith("+++")) {
      // Treat non-prefixed non-empty lines as context (add space prefix)
      diffLines.push(` ${line}`);
      context++;
    }
  }

  if (diffLines.length === 0) {
    return "";
  }

  // Calculate line counts for hunk header
  // oldCount = deletions + context lines (lines in original file)
  // newCount = additions + context lines (lines in new file)
  const oldCount = deletions + context;
  const newCount = additions + context;

  const patchLines: string[] = [];

  // File headers and hunk header
  const isNew = deletions === 0 && additions > 0;
  const isDelete = additions === 0 && deletions > 0;

  if (isNew) {
    patchLines.push("--- /dev/null");
    patchLines.push(`+++ b/${filePath}`);
    patchLines.push(`@@ -0,0 +${lineOffset},${newCount} @@`);
  } else if (isDelete) {
    patchLines.push(`--- a/${filePath}`);
    patchLines.push("+++ /dev/null");
    patchLines.push(`@@ -${lineOffset},${oldCount} +0,0 @@`);
  } else {
    patchLines.push(`--- a/${filePath}`);
    patchLines.push(`+++ b/${filePath}`);
    patchLines.push(`@@ -${lineOffset},${oldCount} +${lineOffset},${newCount} @@`);
  }

  // Add diff lines
  for (const line of diffLines) {
    patchLines.push(line);
  }

  // Ensure trailing newline for proper patch format
  return patchLines.join("\n") + "\n";
}

/**
 * Get the file name from a file path
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

export function DiffViewer({ filePath, diff, lineOffset = 1, className }: DiffViewerProps) {
  const stats = computeDiffStats(diff);
  const isNew = isNewFile(diff);
  const patch = convertToPatchFormat(filePath, diff, lineOffset);

  // If no patch content, show a simple message
  if (!patch) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2">
          <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{getFileName(filePath)}</span>
          <span className="text-xs text-muted-foreground">No changes</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* File header */}
      <div className="flex items-center gap-2 rounded-t-lg bg-zinc-800 px-3 py-2">
        {isNew ? (
          <FilePlus className="h-4 w-4 shrink-0 text-green-500" />
        ) : (
          <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{getFileName(filePath)}</span>
        <DiffStats added={stats.added} removed={stats.removed} modified={stats.modified} isNew={isNew} />
      </div>

      {/* Diff content */}
      <div className="diff-viewer-container overflow-hidden rounded-b-lg">
        <DiffErrorBoundary
          fallback={<pre className="overflow-x-auto bg-zinc-900 p-3 text-xs text-muted-foreground">{diff}</pre>}
        >
          <PatchDiff
            patch={patch}
            options={{
              theme: "github-dark",
              diffStyle: "unified",
              diffIndicators: "classic",
              disableFileHeader: true,
              overflow: "scroll",
            }}
          />
        </DiffErrorBoundary>
      </div>
    </div>
  );
}

interface DiffStatsProps {
  added: number;
  removed: number;
  modified: number;
  isNew: boolean;
}

function DiffStats({ added, removed, modified, isNew }: DiffStatsProps) {
  if (isNew) {
    return <span className="text-xs font-medium text-green-500">+{added}</span>;
  }

  return (
    <span className="flex items-center gap-1 text-xs font-medium">
      {added - modified > 0 && <span className="text-green-500">+{added - modified}</span>}
      {removed - modified > 0 && <span className="text-red-400">-{removed - modified}</span>}
      {modified > 0 && <span className="text-yellow-500">~{modified}</span>}
    </span>
  );
}

/**
 * Simple file display for Write tool (new file creation)
 * Uses the File component from @pierre/diffs for syntax highlighting
 */
interface FileViewerProps {
  filePath: string;
  content: string;
  className?: string;
}

export function FileViewer({ filePath, content, className }: FileViewerProps) {
  const lineCount = content.split("\n").length;

  return (
    <div className={className}>
      {/* File header */}
      <div className="flex items-center gap-2 rounded-t-lg bg-zinc-800 px-3 py-2">
        <FilePlus className="h-4 w-4 shrink-0 text-green-500" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{getFileName(filePath)}</span>
        <span className="text-xs font-medium text-green-500">+{lineCount}</span>
      </div>

      {/* File content */}
      <div className="file-viewer-container overflow-hidden rounded-b-lg">
        <DiffErrorBoundary
          fallback={<pre className="overflow-x-auto bg-zinc-900 p-3 text-xs text-muted-foreground">{content}</pre>}
        >
          <File
            file={{
              name: getFileName(filePath),
              contents: content,
            }}
            options={{
              theme: "github-dark",
              overflow: "scroll",
              disableFileHeader: true,
            }}
          />
        </DiffErrorBoundary>
      </div>
    </div>
  );
}

/**
 * Bash command display component
 */
interface BashCommandProps {
  command: string;
  className?: string;
}

export function BashCommand({ command, className }: BashCommandProps) {
  return (
    <div className={`flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 ${className || ""}`}>
      <SquareTerminal className="h-4 w-4 shrink-0 text-muted-foreground" />
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">{command}</code>
    </div>
  );
}
