import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { OpenCodeExport } from "@agentlogs/shared";
import { convertOpenCodeTranscript } from "@agentlogs/shared/opencode";
import { LiteLLMPricingFetcher } from "@agentlogs/shared/pricing";
import { resolveGitContext } from "@agentlogs/shared/claudecode";
import { uploadUnifiedToAllEnvs } from "../../lib/perform-upload";

const OPENCODE_STORAGE = join(homedir(), ".local", "share", "opencode", "storage");

/**
 * Read a session from OpenCode's local storage and assemble into export format.
 */
function readSessionFromStorage(sessionId: string): OpenCodeExport | null {
  // Find the session file (need to search across project directories)
  const sessionDir = join(OPENCODE_STORAGE, "session");
  if (!existsSync(sessionDir)) {
    return null;
  }

  // Search for session in all project directories
  let sessionInfo: any = null;
  for (const projectId of readdirSync(sessionDir)) {
    const sessionFile = join(sessionDir, projectId, `${sessionId}.json`);
    if (existsSync(sessionFile)) {
      sessionInfo = JSON.parse(readFileSync(sessionFile, "utf-8"));
      break;
    }
  }

  if (!sessionInfo) {
    return null;
  }

  // Read messages for this session
  const messageDir = join(OPENCODE_STORAGE, "message", sessionId);
  if (!existsSync(messageDir)) {
    return null;
  }

  const messages: any[] = [];
  for (const msgFile of readdirSync(messageDir)) {
    if (!msgFile.endsWith(".json")) continue;

    const msgPath = join(messageDir, msgFile);
    const msgInfo = JSON.parse(readFileSync(msgPath, "utf-8"));
    const msgId = msgInfo.id;

    // Read parts for this message
    const partDir = join(OPENCODE_STORAGE, "part", msgId);
    const parts: any[] = [];

    if (existsSync(partDir)) {
      for (const partFile of readdirSync(partDir)) {
        if (!partFile.endsWith(".json")) continue;
        const partPath = join(partDir, partFile);
        const part = JSON.parse(readFileSync(partPath, "utf-8"));
        parts.push(part);
      }
    }

    messages.push({
      info: msgInfo,
      parts,
    });
  }

  // Sort messages by creation time
  messages.sort((a, b) => (a.info.time?.created ?? 0) - (b.info.time?.created ?? 0));

  return {
    info: sessionInfo,
    messages,
  };
}

export async function opencodeUploadCommand(sessionId: string): Promise<void> {
  if (!sessionId) {
    console.error("Error: Session ID is required");
    process.exit(1);
  }

  console.log(`Uploading OpenCode session: ${sessionId}`);

  // Read session from OpenCode storage
  const exportData = readSessionFromStorage(sessionId);

  if (!exportData) {
    console.error(`Error: Session not found: ${sessionId}`);
    console.error(`Searched in: ${OPENCODE_STORAGE}`);
    process.exit(1);
  }

  // Skip subagent sessions (they have a parentID)
  if (exportData.info.parentID) {
    console.log("Skipping subagent session");
    process.exit(0);
  }

  const title = exportData.info.title || "Untitled";
  const messageCount = exportData.messages?.length ?? 0;
  console.log(`Session: "${title}" (${messageCount} messages)`);

  // Fetch pricing data
  console.log("Fetching pricing data...");
  const pricingFetcher = new LiteLLMPricingFetcher();
  const pricingData = await pricingFetcher.fetchModelPricing();
  const pricing = Object.fromEntries(pricingData);

  // Resolve git context from the session's working directory
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
    console.error("Error: Failed to convert transcript");
    process.exit(1);
  }

  // Upload using shared logic (handles allowlist, redaction, multi-env upload)
  console.log("Uploading...");
  const result = await uploadUnifiedToAllEnvs({
    unifiedTranscript,
    sessionId,
    cwd,
    rawTranscript: JSON.stringify(exportData),
  });

  // Exit if skipped due to allowlist
  if (result.skipped) {
    console.log("Skipped: Repository not in allowlist");
    process.exit(0);
  }

  if (result.anySuccess && result.id) {
    console.log("");
    console.log("Upload successful!");
    console.log(`Transcript ID: ${result.id}`);

    // Show URL for each successful environment
    for (const envResult of result.results) {
      if (envResult.success) {
        const url = `${envResult.baseURL}/app/logs/${result.id}`;
        console.log(`View: ${url}`);
      }
    }
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
