import { resolve } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { discoverAllTranscripts, type DiscoveredTranscript, type TranscriptSource } from "@agentlogs/shared";
import { convertOpenCodeTranscript, type OpenCodeExport } from "@agentlogs/shared/opencode";
import { LiteLLMPricingFetcher } from "@agentlogs/shared/pricing";
import { resolveGitContext } from "@agentlogs/shared/claudecode";
import { pickTranscript } from "../tui/transcript-picker";
import { performUploadToAllEnvs, uploadUnifiedToAllEnvs } from "../lib/perform-upload";
import { getAuthenticatedEnvironments } from "../config";

const OPENCODE_STORAGE = join(homedir(), ".local", "share", "opencode", "storage");

export interface UploadCommandOptions {
  source?: TranscriptSource;
  latest?: boolean;
}

/**
 * Interactive upload command - discovers transcripts and shows a picker
 */
export async function interactiveUploadCommand(directory?: string, options: UploadCommandOptions = {}): Promise<void> {
  // Check authentication first
  const authenticatedEnvs = await getAuthenticatedEnvironments();
  if (authenticatedEnvs.length === 0) {
    console.error("You must be logged in to upload transcripts.");
    console.error("Run `agentlogs login` to authenticate.");
    process.exit(1);
  }

  // Resolve directory filter
  const cwdFilter = directory ? resolve(directory) : undefined;

  // Discover transcripts
  console.log("Discovering transcripts...");
  const transcripts = await discoverAllTranscripts({
    sources: options.source ? [options.source] : undefined,
    cwd: cwdFilter,
    limit: 100,
  });

  if (transcripts.length === 0) {
    const filterDesc = [
      cwdFilter ? `directory: ${cwdFilter}` : null,
      options.source ? `source: ${options.source}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    console.log(filterDesc ? `No transcripts found matching filters (${filterDesc}).` : "No transcripts found.");
    return;
  }

  // If --latest, pick the most recent without showing picker
  let selected: DiscoveredTranscript | null = null;

  if (options.latest) {
    selected = transcripts[0]; // Already sorted by timestamp desc
    console.log(`Auto-selecting most recent transcript: ${selected.id}`);
  } else {
    // Show interactive picker
    selected = await pickTranscript(transcripts);
  }

  if (!selected) {
    console.log("No transcript selected.");
    return;
  }

  // Upload the selected transcript
  await uploadTranscript(selected);
}

/**
 * Upload a single discovered transcript
 */
async function uploadTranscript(transcript: DiscoveredTranscript): Promise<void> {
  console.log("");
  console.log(`Uploading ${transcript.source} transcript: ${transcript.id}`);

  if (transcript.cwd) {
    console.log(`Directory: ${transcript.cwd}`);
  }

  try {
    switch (transcript.source) {
      case "claude-code":
        await uploadClaudeCodeTranscript(transcript);
        break;
      case "codex":
        await uploadCodexTranscript(transcript);
        break;
      case "opencode":
        await uploadOpenCodeTranscript(transcript);
        break;
    }
  } catch (error) {
    console.error("");
    console.error("Upload failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function uploadClaudeCodeTranscript(transcript: DiscoveredTranscript): Promise<void> {
  const result = await performUploadToAllEnvs({
    transcriptPath: transcript.path,
    sessionId: transcript.id,
    cwdOverride: transcript.cwd ?? undefined,
    source: "claude-code",
  });

  printUploadResult(result, transcript.source);
}

async function uploadCodexTranscript(transcript: DiscoveredTranscript): Promise<void> {
  const result = await performUploadToAllEnvs({
    transcriptPath: transcript.path,
    sessionId: transcript.id,
    cwdOverride: transcript.cwd ?? undefined,
    source: "codex",
  });

  printUploadResult(result, transcript.source);
}

async function uploadOpenCodeTranscript(transcript: DiscoveredTranscript): Promise<void> {
  // Read the session from OpenCode storage
  const exportData = readOpenCodeSession(transcript.id);

  if (!exportData) {
    throw new Error(`Failed to read OpenCode session: ${transcript.id}`);
  }

  // Fetch pricing data
  const pricingFetcher = new LiteLLMPricingFetcher();
  const pricingData = await pricingFetcher.fetchModelPricing();
  const pricing = Object.fromEntries(pricingData);

  // Resolve git context
  const cwd = exportData.info.directory ?? process.cwd();
  const gitContext = await resolveGitContext(cwd, undefined);

  if (gitContext?.repo) {
    console.log(`Repository: ${gitContext.repo}`);
  }

  // Convert to unified format
  console.log("Converting transcript...");
  const unifiedTranscript = convertOpenCodeTranscript(exportData, {
    pricing,
    gitContext,
    cwd,
  });

  if (!unifiedTranscript) {
    throw new Error("Failed to convert OpenCode transcript");
  }

  // Upload
  console.log("Uploading...");
  const result = await uploadUnifiedToAllEnvs({
    unifiedTranscript,
    sessionId: transcript.id,
    cwd,
    rawTranscript: JSON.stringify(exportData),
  });

  if (result.skipped) {
    console.log("");
    console.log("Skipped: Repository not in allowlist");
    return;
  }

  if (result.anySuccess && result.id) {
    console.log("");
    console.log("Upload successful!");
    console.log(`Transcript ID: ${result.id}`);

    for (const envResult of result.results) {
      if (envResult.success) {
        const url = `${envResult.baseURL}/s/${result.id}`;
        console.log(`View: ${url}`);
      }
    }
    process.exit(0);
  } else {
    console.error("");
    console.error("Upload failed:");
    for (const envResult of result.results) {
      if (!envResult.success && envResult.error) {
        console.error(`  ${envResult.envName}: ${envResult.error}`);
      }
    }
    process.exit(1);
  }
}

/**
 * Read an OpenCode session from local storage
 */
function readOpenCodeSession(sessionId: string): OpenCodeExport | null {
  const sessionDir = join(OPENCODE_STORAGE, "session");
  if (!existsSync(sessionDir)) {
    return null;
  }

  // Search for session in all project directories
  let sessionInfo: Record<string, unknown> | null = null;
  let sessionFilePath: string | null = null;

  for (const projectId of readdirSync(sessionDir)) {
    const sessionFile = join(sessionDir, projectId, `${sessionId}.json`);
    if (existsSync(sessionFile)) {
      sessionInfo = JSON.parse(readFileSync(sessionFile, "utf-8")) as Record<string, unknown>;
      sessionFilePath = sessionFile;
      break;
    }
  }

  if (!sessionInfo || !sessionFilePath) {
    return null;
  }

  // Read messages for this session
  const messageDir = join(OPENCODE_STORAGE, "message", sessionId);
  if (!existsSync(messageDir)) {
    return null;
  }

  interface MessageInfo {
    id: string;
    time?: { created?: number };
    [key: string]: unknown;
  }

  interface PartInfo {
    [key: string]: unknown;
  }

  const messages: Array<{ info: MessageInfo; parts: PartInfo[] }> = [];

  for (const msgFile of readdirSync(messageDir)) {
    if (!msgFile.endsWith(".json")) continue;

    const msgPath = join(messageDir, msgFile);
    const msgInfo = JSON.parse(readFileSync(msgPath, "utf-8")) as MessageInfo;
    const msgId = msgInfo.id;

    // Read parts for this message
    const partDir = join(OPENCODE_STORAGE, "part", msgId);
    const parts: PartInfo[] = [];

    if (existsSync(partDir)) {
      for (const partFile of readdirSync(partDir)) {
        if (!partFile.endsWith(".json")) continue;
        const partPath = join(partDir, partFile);
        const part = JSON.parse(readFileSync(partPath, "utf-8")) as PartInfo;
        parts.push(part);
      }
    }

    messages.push({ info: msgInfo, parts });
  }

  // Sort messages by creation time
  messages.sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0));

  return {
    info: sessionInfo as OpenCodeExport["info"],
    messages: messages as OpenCodeExport["messages"],
  };
}

interface MultiEnvResult {
  results: Array<{
    envName: string;
    baseURL: string;
    success: boolean;
    error?: string;
  }>;
  id: string;
  sessionId: string;
  anySuccess: boolean;
  allSuccess: boolean;
}

function printUploadResult(result: MultiEnvResult, _source: TranscriptSource): void {
  if (result.anySuccess && result.id) {
    console.log("");
    console.log("Upload successful!");
    console.log(`Transcript ID: ${result.id}`);

    for (const envResult of result.results) {
      if (envResult.success) {
        const url = `${envResult.baseURL}/s/${result.id}`;
        console.log(`View: ${url}`);
      }
    }
    process.exit(0);
  } else if (result.results.length === 0) {
    console.log("");
    console.log("Skipped: Repository not in allowlist");
    process.exit(0);
  } else {
    console.error("");
    console.error("Upload failed:");
    for (const envResult of result.results) {
      if (!envResult.success && envResult.error) {
        console.error(`  ${envResult.envName}: ${envResult.error}`);
      }
    }
    process.exit(1);
  }
}
