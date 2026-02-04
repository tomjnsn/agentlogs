import {
  ProcessTerminal,
  TUI,
  SelectList,
  Text,
  type SelectItem,
  type SelectListTheme,
  truncateToWidth,
} from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { DiscoveredTranscript } from "@agentlogs/shared";

const VISIBLE_ITEMS = 15;

const theme: SelectListTheme = {
  selectedPrefix: (text) => chalk.cyan(text),
  selectedText: (text) => chalk.cyan(text),
  description: (text) => chalk.gray(text),
  scrollInfo: (text) => chalk.gray(text),
  noMatch: (text) => chalk.yellow(text),
};

interface TranscriptSelectItem extends SelectItem {
  transcript: DiscoveredTranscript;
}

/**
 * Format relative time from a Date
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "now";
}

/**
 * Format a path for display (shorten home directory)
 */
function formatPath(cwd: string | null, maxWidth: number): string {
  if (!cwd) return "";

  const home = process.env.HOME ?? "";
  let display = cwd;
  if (home && cwd.startsWith(home)) {
    display = "~" + cwd.slice(home.length);
  }

  return truncateToWidth(display, maxWidth, "…", false);
}

/**
 * Format stats with colors: +added ~modified -removed
 */
function formatStats(stats: DiscoveredTranscript["stats"]): string {
  if (!stats) return "";

  const parts: string[] = [];

  if (stats.linesAdded > 0) {
    parts.push(chalk.green(`+${stats.linesAdded}`));
  }
  if (stats.linesModified > 0) {
    parts.push(chalk.yellow(`~${stats.linesModified}`));
  }
  if (stats.linesRemoved > 0) {
    parts.push(chalk.red(`-${stats.linesRemoved}`));
  }

  return parts.join(" ");
}

/**
 * Format a transcript for display in the list
 */
function formatTranscriptLabel(t: DiscoveredTranscript, terminalWidth: number): string {
  const time = formatRelativeTime(t.timestamp).padEnd(7);
  const source = t.source.padEnd(11);

  // Format stats
  const statsStr = formatStats(t.stats);
  const statsWidth = t.stats ? 15 : 0; // Reserve space for stats

  // Calculate remaining width for path and preview
  // Format: "time │ source │ stats │ path │ preview"
  const fixedWidth = 7 + 3 + 11 + 3 + statsWidth + (statsWidth > 0 ? 3 : 0);
  const remainingWidth = Math.max(40, terminalWidth - fixedWidth);

  const pathWidth = Math.min(22, Math.floor(remainingWidth * 0.35));
  const previewWidth = remainingWidth - pathWidth - 3;

  const path = formatPath(t.cwd, pathWidth).padEnd(pathWidth);
  const preview = truncateToWidth(t.preview ?? "", previewWidth, "…", false);

  if (statsStr) {
    return `${time} │ ${source} │ ${statsStr.padEnd(15)} │ ${path} │ ${preview}`;
  }
  return `${time} │ ${source} │ ${path} │ ${preview}`;
}

/**
 * Show an interactive picker for transcripts
 * Returns the selected transcript or null if cancelled
 */
export async function pickTranscript(transcripts: DiscoveredTranscript[]): Promise<DiscoveredTranscript | null> {
  if (transcripts.length === 0) {
    console.log("No transcripts found.");
    return null;
  }

  return new Promise((resolve) => {
    const terminal = new ProcessTerminal();
    const tui = new TUI(terminal);

    // Get terminal width for formatting
    const terminalWidth = process.stdout.columns ?? 80;

    // Create items for the list
    const items: TranscriptSelectItem[] = transcripts.map((t) => ({
      value: t.id,
      label: formatTranscriptLabel(t, terminalWidth),
      description: "", // Not using descriptions for cleaner look
      transcript: t,
    }));

    // Create header text
    const header = new Text(chalk.gray("Select a transcript to upload (↑↓ navigate, Enter select, Esc cancel)"), 1);

    // Create the select list
    const list = new SelectList(items, VISIBLE_ITEMS, theme);

    list.onSelect = (item) => {
      tui.stop();
      const selected = item as TranscriptSelectItem;
      resolve(selected.transcript);
    };

    list.onCancel = () => {
      tui.stop();
      resolve(null);
    };

    // Add components
    tui.addChild(header);
    tui.addChild(list);
    tui.setFocus(list);

    // Start the TUI
    tui.start();
  });
}
