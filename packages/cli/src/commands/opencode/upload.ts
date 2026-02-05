import { spawnSync } from "child_process";
import type { OpenCodeExport } from "@agentlogs/shared";
import { convertOpenCodeTranscript } from "@agentlogs/shared/opencode";
import { LiteLLMPricingFetcher } from "@agentlogs/shared/pricing";
import { resolveGitContext } from "@agentlogs/shared/claudecode";
import { uploadUnifiedToAllEnvs } from "../../lib/perform-upload";

/**
 * Read a session using OpenCode's export command.
 * This abstracts away the storage backend (JSON files or SQLite).
 */
function readSessionFromExport(sessionId: string): OpenCodeExport | null {
  try {
    const result = spawnSync("opencode", ["export", sessionId], {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status !== 0 || result.error) {
      return null;
    }

    const output = result.stdout.trim();
    if (!output) {
      return null;
    }

    return JSON.parse(output) as OpenCodeExport;
  } catch {
    return null;
  }
}

export async function opencodeUploadCommand(sessionId: string): Promise<void> {
  if (!sessionId) {
    console.error("Error: Session ID is required");
    process.exit(1);
  }

  console.log(`Uploading OpenCode session: ${sessionId}`);

  // Read session from OpenCode storage
  const exportData = readSessionFromExport(sessionId);

  if (!exportData) {
    console.error(`Error: Session not found: ${sessionId}`);
    console.error(`Run 'opencode session list' to see available sessions`);
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
