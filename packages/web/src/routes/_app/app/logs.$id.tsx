import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { UnifiedTranscriptMessage } from "@agentlogs/shared/claudecode";
import { unifiedTranscriptSchema } from "@agentlogs/shared/schemas";
import {
  Calendar,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Folder,
  GitBranch,
  Globe,
  Hash,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  Search,
  Brain,
  Sparkles,
  SquareTerminal,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { ClaudeCodeIcon, CodexIcon, GitHubIcon, OpenCodeIcon } from "../../../components/icons/source-icons";
import { DiffViewer, FileViewer } from "../../../components/diff-viewer";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";

import {
  extractImageReferences,
  replaceImageReferencesForDisplay,
  type ImageReference,
} from "../../../lib/message-utils";
import { getTranscript, updateVisibility } from "../../../lib/server-functions";

export const Route = createFileRoute("/_app/app/logs/$id")({
  loader: ({ params }) => getTranscript({ data: params.id }),
  component: TranscriptDetailComponent,
});

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths > 0) return `${diffMonths}mo ago`;
  if (diffWeeks > 0) return `${diffWeeks}w ago`;
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  return "just now";
}

function getSourceLabel(source: string): string {
  switch (source) {
    case "codex":
      return "Codex";
    case "claude-code":
      return "Claude Code";
    case "opencode":
      return "OpenCode";
    default:
      return "Unknown";
  }
}

function getSourceIcon(source: string, className?: string) {
  switch (source) {
    case "codex":
      return <CodexIcon className={className} />;
    case "claude-code":
      return <ClaudeCodeIcon className={className} />;
    case "opencode":
      return <OpenCodeIcon className={className} />;
    default:
      return <Terminal className={className} />;
  }
}

function getModelDisplayName(model: string | null): string {
  if (!model) return "Unknown";

  // Parse model strings like:
  // - claude-opus-4-5-20251101 → Claude Opus 4.5
  // - claude-sonnet-4-20250514 → Claude Sonnet 4
  // - claude-3-5-haiku-20241022 → Claude Haiku 3.5
  const match = model.match(/^claude-(?:(\d+)-(\d+)-)?(opus|sonnet|haiku)(?:-(\d+)(?:-(\d+))?)?-\d{8}$/);
  if (!match) return model;

  const [, oldMajor, oldMinor, family, newMajor, newMinor] = match;
  const major = newMajor ?? oldMajor;
  const minor = newMinor ?? oldMinor;
  const version = minor ? `${major}.${minor}` : major;
  const familyName = family.charAt(0).toUpperCase() + family.slice(1);

  return `Claude ${familyName} ${version}`;
}

function formatRepoName(repo: string): { label: string; isGitHub: boolean } {
  if (repo.startsWith("github.com/")) {
    return { label: repo.replace("github.com/", ""), isGitHub: true };
  }
  return { label: repo, isGitHub: false };
}

// Count user prompts in messages
function countUserPrompts(messages: UnifiedTranscriptMessage[]): number {
  return messages.filter((m) => m.type === "user").length;
}

// Get unique tools used in transcript
function getUsedTools(messages: UnifiedTranscriptMessage[]): string[] {
  const tools = new Set<string>();
  for (const msg of messages) {
    if (msg.type === "tool-call" && msg.toolName) {
      tools.add(msg.toolName);
    }
  }
  return Array.from(tools);
}

// Check if text is an internal system message (for filtering)
// Note: Most internal messages are now filtered at ingest time in claudecode.ts
// This is kept as a fallback for any edge cases
function isInternalMessage(text: string): boolean {
  const internalPatterns = [/^<local-command-caveat>.*<\/local-command-caveat>/s];
  const trimmed = text.trim();
  return internalPatterns.some((pattern) => pattern.test(trimmed));
}

// Get user messages with their indices for navigation
function getUserMessagesWithIndices(messages: UnifiedTranscriptMessage[]): Array<{ index: number; text: string }> {
  const result: Array<{ index: number; text: string }> = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === "user" && !isInternalMessage(msg.text)) {
      result.push({ index: i, text: msg.text });
    } else if (msg.type === "command") {
      result.push({ index: i, text: msg.name });
    }
  }
  return result;
}

function TranscriptDetailComponent() {
  const data = Route.useLoaderData();

  // Parse and validate the unified transcript
  const unifiedTranscript = unifiedTranscriptSchema.parse(data.unifiedTranscript);
  const timeAgo = formatTimeAgo(new Date(data.createdAt));
  const userPrompts = countUserPrompts(unifiedTranscript.messages);
  const usedTools = getUsedTools(unifiedTranscript.messages);
  const userMessages = getUserMessagesWithIndices(unifiedTranscript.messages);

  // Calculate token usage percentage (approximate context limit)
  const contextLimit = 200000; // Claude's context limit
  const tokenPercentage = Math.round((unifiedTranscript.tokenUsage.totalTokens / contextLimit) * 100);
  const repoInfo = unifiedTranscript.git?.repo ? formatRepoName(unifiedTranscript.git.repo) : null;

  // Auto-scroll to message if hash is present in URL
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        const target = document.querySelector(hash);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, []);

  return (
    <div className="flex gap-8">
      {/* Fixed Navigation Indicator */}
      <MessageNavigator userMessages={userMessages} />

      {/* Main Content */}
      <div className="min-w-0 flex-1">
        {/* Header */}
        <header className="mb-8">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {data.summary || unifiedTranscript.preview || "Untitled Thread"}
          </h1>
        </header>

        {/* Messages */}
        <div className="space-y-4">
          {unifiedTranscript.messages.map((message, i) => (
            <MessageBlock key={i} message={message} index={i} isAdmin={data.isAdmin} />
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <aside className="sticky top-8 hidden h-fit w-72 shrink-0 lg:block">
        <div className="space-y-6">
          {/* Visibility */}
          <VisibilitySection transcriptId={data.id} visibility={data.visibility} isOwner={data.isOwner} />

          {/* Thread Metadata */}
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Log</h2>
            <div className="space-y-2.5 text-sm">
              <SidebarItem
                icon={
                  <img
                    src={data.userImage || undefined}
                    alt={data.userName || "User"}
                    className="h-4 w-4 rounded-full"
                  />
                }
                label={data.userName || "Unknown"}
              />
              <SidebarItem icon={<Calendar className="h-4 w-4" />} label={timeAgo} />
              {repoInfo && (
                <SidebarItem
                  icon={repoInfo.isGitHub ? <GitHubIcon className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                  label={repoInfo.label}
                  link={`/repos/${data.repoId}`}
                />
              )}
              {unifiedTranscript.git?.branch && (
                <SidebarItem icon={<GitBranch className="h-4 w-4" />} label={unifiedTranscript.git.branch} />
              )}
              <SidebarItem
                icon={<Brain className="h-4 w-4" />}
                label={getModelDisplayName(unifiedTranscript.model)}
                tooltip={unifiedTranscript.model ?? undefined}
              />
              <SidebarItem
                icon={<CircleDollarSign className="h-4 w-4" />}
                label={`$${unifiedTranscript.costUsd.toFixed(2)}`}
              />
              <SidebarItem icon={getSourceIcon(data.source, "h-4 w-4")} label={getSourceLabel(data.source)} />
              {data.transcriptId && (
                <SidebarItem icon={<Hash className="h-4 w-4" />} label={data.transcriptId} tooltip="Transcript ID" />
              )}
              <SidebarItem icon={<MessageSquare className="h-4 w-4" />} label={`${userPrompts} prompts`} />
              <SidebarItem
                icon={<Zap className="h-4 w-4" />}
                label={`${tokenPercentage}% of ${Math.round(contextLimit / 1000)}k`}
              />
            </div>
          </section>

          {/* Tools Used */}
          {usedTools.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Tools</h2>
              <div className="flex flex-wrap gap-1.5">
                {usedTools.slice(0, 8).map((tool) => (
                  <span key={tool} className="rounded-md bg-accent/50 px-2 py-0.5 text-xs text-muted-foreground">
                    {tool}
                  </span>
                ))}
                {usedTools.length > 8 && (
                  <span className="rounded-md bg-accent/50 px-2 py-0.5 text-xs text-muted-foreground">
                    +{usedTools.length - 8} more
                  </span>
                )}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  link,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  link?: string;
  tooltip?: string;
}) {
  const content = (
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );

  const wrapped = link ? (
    <Link to={link} className="block transition-colors hover:text-foreground">
      {content}
    </Link>
  ) : (
    content
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-default">{wrapped}</div>
        </TooltipTrigger>
        <TooltipContent side="left">{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return wrapped;
}

function getVisibilityIcon(visibility: string) {
  switch (visibility) {
    case "public":
      return <Globe className="h-4 w-4" />;
    case "team":
      return <Users className="h-4 w-4" />;
    case "private":
    default:
      return <Lock className="h-4 w-4" />;
  }
}

function getVisibilityLabel(visibility: string) {
  switch (visibility) {
    case "public":
      return "Public";
    case "team":
      return "Team";
    case "private":
    default:
      return "Private";
  }
}

interface VisibilitySectionProps {
  transcriptId: string;
  visibility: string;
  isOwner: boolean;
}

function VisibilitySection({ transcriptId, visibility, isOwner }: VisibilitySectionProps) {
  const router = useRouter();
  const [currentVisibility, setCurrentVisibility] = useState(visibility);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVisibilityChange = async (newVisibility: string) => {
    if (newVisibility === currentVisibility) return;

    setIsUpdating(true);
    setShowLoading(true);
    setError(null);

    const minDisplayPromise = new Promise((resolve) => setTimeout(resolve, 200));

    try {
      await Promise.all([updateVisibility({ data: { transcriptId, visibility: newVisibility } }), minDisplayPromise]);
      setCurrentVisibility(newVisibility);
      router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update visibility");
      setCurrentVisibility(currentVisibility);
    } finally {
      setIsUpdating(false);
      setShowLoading(false);
    }
  };

  return (
    <section>
      {isOwner ? (
        <div>
          <Select value={currentVisibility} onValueChange={handleVisibilityChange} disabled={isUpdating}>
            <SelectTrigger className="w-full">
              <SelectValue>
                <div className="flex items-center gap-2 text-muted-foreground">
                  {showLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : getVisibilityIcon(currentVisibility)}
                  <span>{getVisibilityLabel(currentVisibility)}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">
                <div className="flex items-start gap-2.5">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <div className="text-sm text-muted-foreground">Private</div>
                    <div className="text-xs text-muted-foreground/60">Only you can see this</div>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="team">
                <div className="flex items-start gap-2.5">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <div className="text-sm text-muted-foreground">Team</div>
                    <div className="text-xs text-muted-foreground/60">Visible to team members</div>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="public">
                <div className="flex items-start gap-2.5">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <div className="text-sm text-muted-foreground">Public</div>
                    <div className="text-xs text-muted-foreground/60">Visible to everyone</div>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {getVisibilityIcon(visibility)}
          <span>{getVisibilityLabel(visibility)}</span>
        </div>
      )}
    </section>
  );
}

interface MessageNavigatorProps {
  userMessages: Array<{ index: number; text: string }>;
}

function MessageNavigator({ userMessages }: MessageNavigatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleIndex, setVisibleIndex] = useState<number | null>(null);

  // Set up Intersection Observer to track visible user messages
  useEffect(() => {
    if (userMessages.length === 0) return;

    const observers: IntersectionObserver[] = [];
    const visibilityMap = new Map<number, boolean>();

    for (const msg of userMessages) {
      const messageId = `msg-${msg.index + 1}`;
      const element = document.getElementById(messageId);
      if (!element) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visibilityMap.set(msg.index, entry.isIntersecting);
          }
          // Find the first visible message
          for (const m of userMessages) {
            if (visibilityMap.get(m.index)) {
              setVisibleIndex(m.index);
              return;
            }
          }
        },
        { threshold: 0.1, rootMargin: "-20% 0px -60% 0px" },
      );

      observer.observe(element);
      observers.push(observer);
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [userMessages]);

  const scrollToMessage = (index: number) => {
    const messageId = `msg-${index + 1}`;
    const target = document.getElementById(messageId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      window.history.pushState({}, "", `#${messageId}`);
    }
    setIsOpen(false);
  };

  if (userMessages.length === 0) return null;

  return (
    <div className="fixed top-1/2 left-4 z-50 hidden -translate-y-1/2 lg:block">
      <div className="relative">
        {/* Dynamic lines indicator */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background/95 px-2 py-2.5 shadow-lg backdrop-blur transition-colors hover:bg-accent"
          title="Jump to message"
        >
          {userMessages.map((msg) => (
            <div
              key={msg.index}
              className={`h-0.5 w-5 rounded-full transition-colors ${
                visibleIndex === msg.index ? "bg-white" : "bg-muted-foreground/40"
              }`}
            />
          ))}
        </button>

        {isOpen && (
          <div className="absolute top-0 left-12 w-72 rounded-lg border border-border bg-background/95 p-3 shadow-xl backdrop-blur">
            <ol className="space-y-2">
              {userMessages.map((msg, i) => (
                <li key={msg.index}>
                  <button
                    onClick={() => scrollToMessage(msg.index)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                      visibleIndex === msg.index ? "bg-accent/50" : ""
                    }`}
                  >
                    <span className="shrink-0 text-muted-foreground">{i + 1}.</span>
                    <span className="line-clamp-1">
                      {msg.text.slice(0, 50)}
                      {msg.text.length > 50 ? "..." : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function ImageGallery({ images }: { images: ImageReference[] }) {
  if (images.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {images.map((img) => (
        <a
          key={img.sha256}
          href={`/api/blobs/${img.sha256}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <img
            src={`/api/blobs/${img.sha256}`}
            alt={`Image ${img.sha256.slice(0, 8)}`}
            className="max-h-64 max-w-full rounded-lg border border-border object-contain hover:border-primary"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
}

// Get icon for tool type
function getToolIcon(toolName: string | null): React.ComponentType<{ className?: string }> {
  switch (toolName) {
    case "Bash":
    case "BashOutput":
      return SquareTerminal;
    case "Read":
      return FileText;
    case "Write":
    case "Edit":
      return Pencil;
    case "Glob":
      return Folder;
    case "Grep":
    case "WebSearch":
      return Search;
    case "WebFetch":
      return Globe;
    case "Task":
      return Sparkles;
    default:
      return Terminal;
  }
}

// Get tool description from input (for display in the collapsed view)
function getToolDescription(toolName: string | null, input: unknown): string {
  if (!toolName) return "";

  const inputObj = input as Record<string, unknown> | undefined;

  switch (toolName) {
    case "Read":
    case "Write":
    case "Edit":
      return inputObj?.file_path ? String(inputObj.file_path) : "";
    case "Glob":
      return inputObj?.pattern ? String(inputObj.pattern) : "";
    case "Grep":
      return inputObj?.pattern ? String(inputObj.pattern) : "";
    case "Bash":
      return inputObj?.command ? String(inputObj.command) : "";
    case "Task":
      return inputObj?.prompt ? String(inputObj.prompt) : "";
    case "WebFetch":
      return inputObj?.url ? String(inputObj.url) : "";
    case "WebSearch":
      return inputObj?.query ? String(inputObj.query) : "";
    default:
      return "";
  }
}

interface MessageBlockProps {
  message: UnifiedTranscriptMessage;
  index: number;
  isAdmin?: boolean;
}

function MessageBlock({ message, index, isAdmin }: MessageBlockProps) {
  const messageId = `msg-${index + 1}`;

  // User message - dark pill with avatar
  if (message.type === "user") {
    // Skip internal system messages
    if (isInternalMessage(message.text)) {
      return null;
    }

    const userImages = message.images ?? [];

    return (
      <div id={messageId} className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 rounded-lg bg-secondary/60 px-4 py-2.5">
          <p className="text-sm break-all whitespace-pre-wrap">{message.text}</p>
          <ImageGallery images={userImages} />
        </div>
      </div>
    );
  }

  // Thinking block - collapsible
  if (message.type === "thinking") {
    return <ThinkingBlock messageId={messageId} text={message.text} />;
  }

  // Tool call - collapsible with icon
  if (message.type === "tool-call") {
    return (
      <ToolCallBlock
        messageId={messageId}
        toolName={message.toolName}
        input={message.input}
        output={message.output}
        error={message.error}
        isError={message.isError}
        isAdmin={isAdmin}
      />
    );
  }

  // Agent response - rendered text
  if (message.type === "agent") {
    return (
      <div id={messageId} className="prose prose-invert prose-sm max-w-none">
        <Streamdown className="text-sm">{message.text}</Streamdown>
      </div>
    );
  }

  // Compaction summary
  if (message.type === "compaction-summary") {
    return (
      <div id={messageId} className="text-sm text-muted-foreground italic">
        {message.text}
      </div>
    );
  }

  // Command (slash command)
  if (message.type === "command") {
    return (
      <div id={messageId} className="flex items-start gap-3">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/60">
          <Terminal className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="rounded-lg bg-secondary/60 px-4 py-2.5">
          <code className="font-mono text-sm">
            {message.name}
            {message.args && <span className="text-muted-foreground"> {message.args}</span>}
          </code>
          {message.output && (
            <pre className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">{message.output}</pre>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function ThinkingBlock({ messageId, text }: { messageId: string; text: string }) {
  return (
    <Collapsible id={messageId} defaultOpen={false} className="group">
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <span>Thinking</span>
        <ChevronDown className="h-4 w-4 transition-transform group-data-[open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-lg border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground">
          <pre className="font-sans whitespace-pre-wrap">{text}</pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ToolCallBlockProps {
  messageId: string;
  toolName: string | null;
  input: unknown;
  output: unknown;
  error?: string;
  isError?: boolean | string;
  isAdmin?: boolean;
}

// Parse diff to count additions, deletions, and modifications
function parseDiffStats(diff: string): { added: number; removed: number; modified: number } {
  const lines = diff.split("\n");
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  // If there are both additions and removals, some are likely modifications
  const modified = Math.min(added, removed);
  return { added, removed, modified };
}

// Get display name for tool (some tools have different display names)
function getToolDisplayName(toolName: string | null): string {
  if (toolName === "Bash") return "Shell";
  return toolName || "Tool";
}

// Debug section for admins - shows raw JSON data
function AdminDebugSection({ input, output, error }: { input: unknown; output: unknown; error?: string }) {
  return (
    <Collapsible
      defaultOpen={false}
      className="m-3 rounded-lg border border-dashed border-yellow-500/30 bg-yellow-950/10"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
        <span className="font-medium text-yellow-500">🔧 Debug</span>
        <span className="text-yellow-500/60">(admin only)</span>
        <ChevronDown className="ml-auto h-3 w-3 text-yellow-500/60 transition-transform group-data-[open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 px-3 pb-3">
          {input != null && (
            <div>
              <div className="mb-1 text-xs font-medium text-yellow-500/80">Input</div>
              <pre className="overflow-x-auto rounded bg-black/40 p-2 font-mono text-xs text-yellow-100/70">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {output != null && (
            <div>
              <div className="mb-1 text-xs font-medium text-yellow-500/80">Output</div>
              <pre className="overflow-x-auto rounded bg-black/40 p-2 font-mono text-xs text-yellow-100/70">
                {JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
          {error && (
            <div>
              <div className="mb-1 text-xs font-medium text-yellow-500/80">Error</div>
              <pre className="overflow-x-auto rounded bg-black/40 p-2 font-mono text-xs text-red-300">{error}</pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolCallBlock({ messageId, toolName, input, output, error, isError, isAdmin }: ToolCallBlockProps) {
  const Icon = getToolIcon(toolName);
  const description = getToolDescription(toolName, input);
  const displayName = getToolDisplayName(toolName);

  // Extract images from input/output
  const inputImages = extractImageReferences(input);
  const outputImages = extractImageReferences(output);

  const inputObj = input as Record<string, unknown> | undefined;
  const outputObj = output as Record<string, unknown> | undefined;
  const fileObj = outputObj?.file as Record<string, unknown> | undefined;
  const isEditWithDiff = toolName === "Edit" && !!inputObj?.file_path && !!inputObj?.diff;
  const isWriteWithContent = toolName === "Write" && !!inputObj?.file_path && !!inputObj?.content;
  const isReadWithContent = toolName === "Read" && !!inputObj?.file_path && !!fileObj?.content;
  const isBashWithCommand = toolName === "Bash" && !!inputObj?.command;
  const isGrepWithFilenames = toolName === "Grep" && Array.isArray(outputObj?.filenames);

  // Calculate diff stats for Edit tool
  const diffStats = isEditWithDiff ? parseDiffStats(String(inputObj!.diff)) : null;

  // For Bash, use description if available, otherwise truncated command
  const bashDescription = isBashWithCommand
    ? inputObj?.description
      ? String(inputObj.description)
      : String(inputObj!.command)
    : "";

  // Determine file path for file-based tools (strip ./ prefix for cleaner display)
  const filePath = inputObj?.file_path ? String(inputObj.file_path).replace(/^\.\//, "") : "";

  // Common styles
  const collapsibleClassName =
    "group overflow-hidden rounded-lg border border-border bg-zinc-900/50 transition-colors hover:border-muted-foreground/30";
  const triggerClassName = "flex w-full items-center gap-3 px-3 py-2 text-left";

  // For Edit/Write tools, wrap DiffViewer/FileViewer in collapsible
  if (isEditWithDiff || isWriteWithContent) {
    return (
      <Collapsible id={messageId} defaultOpen={false} className={collapsibleClassName}>
        <CollapsibleTrigger className={triggerClassName}>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{displayName}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{filePath}</span>
          {diffStats && (
            <span className="flex shrink-0 items-center gap-1 text-sm">
              {diffStats.added - diffStats.modified > 0 && (
                <span className="text-green-500">+{diffStats.added - diffStats.modified}</span>
              )}
              {diffStats.removed - diffStats.modified > 0 && (
                <span className="text-red-400">-{diffStats.removed - diffStats.modified}</span>
              )}
              {diffStats.modified > 0 && <span className="text-yellow-500">~{diffStats.modified}</span>}
            </span>
          )}
          {(error || isError) && (
            <span className="shrink-0 rounded bg-destructive/20 px-1.5 py-0.5 text-xs text-destructive">Error</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div>
            {isEditWithDiff && (
              <DiffViewer
                filePath={filePath}
                diff={String(inputObj!.diff)}
                lineOffset={typeof inputObj!.lineOffset === "number" ? inputObj!.lineOffset : undefined}
                hideHeader
              />
            )}
            {isWriteWithContent && <FileViewer filePath={filePath} content={String(inputObj!.content)} hideHeader />}
            {(error || isError) && (
              <div className="m-3 rounded-lg bg-destructive/10 p-3">
                <div className="mb-1.5 text-xs font-medium text-destructive">Error</div>
                <pre className="text-xs text-destructive">{error || "Operation failed"}</pre>
              </div>
            )}
            {isAdmin && <AdminDebugSection input={input} output={output} error={error} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // For Read tool with file content
  if (isReadWithContent) {
    const fileContent = String(fileObj!.content);
    const lineCount = fileObj?.numLines ? Number(fileObj.numLines) : fileContent.split("\n").length;

    return (
      <Collapsible id={messageId} defaultOpen={false} className={collapsibleClassName}>
        <CollapsibleTrigger className={triggerClassName}>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{displayName}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{filePath}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{lineCount} lines</span>
          {(error || isError) && (
            <span className="shrink-0 rounded bg-destructive/20 px-1.5 py-0.5 text-xs text-destructive">Error</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div>
            <FileViewer filePath={filePath} content={fileContent} hideHeader />
            {(error || isError) && (
              <div className="m-3 rounded-lg bg-destructive/10 p-3">
                <div className="mb-1.5 text-xs font-medium text-destructive">Error</div>
                <pre className="text-xs text-destructive">{error || "Operation failed"}</pre>
              </div>
            )}
            {isAdmin && <AdminDebugSection input={input} output={output} error={error} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // For Grep results with filenames
  if (isGrepWithFilenames) {
    const filenames = outputObj!.filenames as string[];

    return (
      <Collapsible id={messageId} defaultOpen={false} className={collapsibleClassName}>
        <CollapsibleTrigger className={triggerClassName}>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{displayName}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{description}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{filenames.length} files</span>
          {(error || isError) && (
            <span className="shrink-0 rounded bg-destructive/20 px-1.5 py-0.5 text-xs text-destructive">Error</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 py-2">
            <ul className="space-y-1 text-sm">
              {filenames.map((filename, i) => (
                <li key={i} className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{filename}</span>
                </li>
              ))}
            </ul>
            {error && (
              <div className="mt-3">
                <div className="mb-1.5 text-xs font-medium text-destructive">Error</div>
                <pre className="overflow-x-auto rounded-md bg-destructive/10 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
                  {error}
                </pre>
              </div>
            )}
            {isAdmin && <AdminDebugSection input={input} output={output} error={error} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // For Bash commands
  if (isBashWithCommand) {
    return (
      <Collapsible id={messageId} defaultOpen={false} className={collapsibleClassName}>
        <CollapsibleTrigger className={triggerClassName}>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{displayName}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{bashDescription}</span>
          {(error || isError) && (
            <span className="shrink-0 rounded bg-destructive/20 px-1.5 py-0.5 text-xs text-destructive">Error</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 p-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Command</div>
              <pre className="overflow-x-auto rounded-md bg-black/30 p-3 font-mono text-xs whitespace-pre-wrap">
                {String(inputObj!.command)}
              </pre>
            </div>
            {outputObj?.stdout ? (
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Output</div>
                <pre className="overflow-x-auto rounded-md bg-black/30 p-3 font-mono text-xs whitespace-pre-wrap">
                  {String(outputObj.stdout)}
                </pre>
              </div>
            ) : null}
            {outputObj?.stderr ? (
              <div>
                <div className="mb-1.5 text-xs font-medium text-red-400">Stderr</div>
                <pre className="overflow-x-auto rounded-md bg-red-950/30 p-3 font-mono text-xs whitespace-pre-wrap text-red-300">
                  {String(outputObj.stderr)}
                </pre>
              </div>
            ) : null}
            {error && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-destructive">Error</div>
                <pre className="overflow-x-auto rounded-md bg-destructive/10 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
                  {error}
                </pre>
              </div>
            )}
            {!outputObj?.stdout && !outputObj?.stderr && !error && (
              <div className="text-xs text-muted-foreground">No output</div>
            )}
            {isAdmin && <AdminDebugSection input={input} output={output} error={error} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // Default collapsible view for other tools
  return (
    <Collapsible id={messageId} defaultOpen={false} className={collapsibleClassName}>
      <CollapsibleTrigger className={triggerClassName}>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">{displayName}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{description}</span>
        {(error || isError) && (
          <span className="shrink-0 rounded bg-destructive/20 px-1.5 py-0.5 text-xs text-destructive">Error</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 p-3">
          {input != null ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Input</div>
              <pre className="overflow-x-auto rounded-md bg-black/30 p-3 text-xs">
                {String(JSON.stringify(replaceImageReferencesForDisplay(input), null, 2) ?? "")}
              </pre>
              <ImageGallery images={inputImages} />
            </div>
          ) : null}
          {output != null ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Output</div>
              <pre className="overflow-x-auto rounded-md bg-black/30 p-3 text-xs">
                {String(JSON.stringify(replaceImageReferencesForDisplay(output), null, 2) ?? "")}
              </pre>
              <ImageGallery images={outputImages} />
            </div>
          ) : null}
          {error && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-destructive">Error</div>
              <pre className="overflow-x-auto rounded-md bg-destructive/10 p-3 text-xs text-destructive">{error}</pre>
            </div>
          )}
          {isAdmin && <AdminDebugSection input={input} output={output} error={error} />}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
