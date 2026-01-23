import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { OpenCodeExport } from "@agentlogs/shared";
import { convertOpenCodeTranscript } from "@agentlogs/shared/opencode";
import { LiteLLMPricingFetcher } from "@agentlogs/shared/pricing";
import { uploadTranscript } from "@agentlogs/shared/upload";
import { redactSecretsDeep } from "@agentlogs/shared/redact";
import { createHash } from "crypto";
import { getAuthenticatedEnvironments } from "../config";
import { cacheTranscriptId, getOrCreateTranscriptId } from "../local-store";
import { resolveGitContext } from "@agentlogs/shared/claudecode";

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
    process.exit(1);
  }

  // Read session from OpenCode storage
  const exportData = readSessionFromStorage(sessionId);

  if (!exportData) {
    process.exit(1);
  }

  // Skip subagent sessions (they have a parentID)
  if (exportData.info.parentID) {
    process.exit(0);
  }

  // Get authenticated environments
  const authenticatedEnvs = await getAuthenticatedEnvironments();
  if (authenticatedEnvs.length === 0) {
    process.exit(1);
  }

  // Fetch pricing data
  const pricingFetcher = new LiteLLMPricingFetcher();
  const pricingData = await pricingFetcher.fetchModelPricing();
  const pricing = Object.fromEntries(pricingData);

  // Resolve git context from the session's working directory
  const cwd = exportData.info.directory ?? process.cwd();
  const gitContext = await resolveGitContext(cwd, undefined);

  // Convert to unified format
  const unifiedTranscript = convertOpenCodeTranscript(exportData, {
    pricing,
    gitContext,
    cwd,
  });

  if (!unifiedTranscript) {
    process.exit(1);
  }

  // Redact secrets
  const redactedTranscript = redactSecretsDeep(unifiedTranscript);

  // Compute sha256 from unified transcript (not raw) so changes in conversion are detected
  const unifiedJson = JSON.stringify(redactedTranscript);
  const sha256 = createHash("sha256").update(unifiedJson).digest("hex");

  // Raw transcript is still sent for archival but not used for dedup
  const rawTranscript = JSON.stringify(exportData);

  // Generate stable client ID
  const clientId = await getOrCreateTranscriptId(sessionId);

  // Upload to all authenticated environments, track last successful result
  let lastResult: { transcriptId: string; transcriptUrl: string } | null = null;

  for (const env of authenticatedEnvs) {
    try {
      const result = await uploadTranscript(
        {
          id: clientId,
          sha256,
          rawTranscript,
          unifiedTranscript: redactedTranscript,
        },
        {
          serverUrl: env.baseURL,
          authToken: env.token,
        },
      );

      if (result.success && result.id) {
        await cacheTranscriptId(sessionId, result.id);
        const url = `${env.baseURL}/app/logs/${result.id}`;
        lastResult = { transcriptId: result.id, transcriptUrl: url };
      }
    } catch {
      // Silently continue to next environment
    }
  }

  // Output single JSON result to stdout (plugin parses this)
  if (lastResult) {
    console.log(JSON.stringify(lastResult));
  } else {
    process.exit(1);
  }
}
