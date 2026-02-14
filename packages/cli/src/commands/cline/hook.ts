/**
 * Cline Hook Command
 *
 * Handles PostToolUse, TaskComplete, and TaskCancel events from Cline hooks.
 * Reads JSON from stdin, processes the event, and outputs JSON response.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { convertClineTranscript, type ClineMessage, type ClineTaskMetadata, type UploadBlob } from "@agentlogs/shared";
import { LiteLLMPricingFetcher } from "@agentlogs/shared/pricing";
import { resolveGitContext } from "@agentlogs/shared/claudecode";
import { uploadUnifiedToAllEnvs } from "../../lib/perform-upload";
import { getRepoIdFromCwd, isRepoAllowed } from "../../settings";
import {
  hookLogger as logger,
  containsGitCommit,
  parseCommitShaFromOutput,
  parseCommitTitleFromOutput,
  parseBranchFromOutput,
  trackCommit,
  readStdinWithPreview,
  getOrCreateTranscriptId,
} from "../../lib/hooks-shared";

// ============================================================================
// Types
// ============================================================================

interface ClineHookInput {
  hookName: string;
  taskId: string;
  workspaceRoots?: string[];
  postToolUse?: {
    toolName: string;
    parameters: Record<string, unknown>;
    result?: string;
    success?: boolean;
  };
  taskComplete?: {
    taskMetadata: { taskId: string; ulid: string };
  };
  taskCancel?: {
    taskMetadata: { taskId: string; ulid: string };
  };
}

const CLINE_TASKS_DIR = join(homedir(), ".cline", "data", "tasks");

// ============================================================================
// Main Hook Command
// ============================================================================

export async function clineHookCommand(): Promise<void> {
  const startTime = Date.now();
  let hookName: string | undefined;
  let taskId: string | undefined;

  try {
    const { preview, full } = await readStdinWithPreview();

    logger.info(`Cline hook invoked (stdin: ${full.length} bytes)`);

    if (!full.trim()) {
      logger.warn("Cline hook received empty stdin - ignoring");
      outputResponse();
      process.exit(0);
    }

    // Fast path: skip PostToolUse that aren't git commits
    const isPostToolUse = preview.includes('"PostToolUse"');
    const mightBeGitCommit = preview.includes("git") && preview.includes("commit");
    if (isPostToolUse && !mightBeGitCommit) {
      outputResponse();
      const duration = Date.now() - startTime;
      logger.info(`Cline hook completed: PostToolUse (fast path, ${duration}ms)`);
      process.exit(0);
    }

    let hookInput: ClineHookInput;
    try {
      hookInput = JSON.parse(full) as ClineHookInput;
    } catch (error) {
      logger.error("Cline hook failed to parse stdin JSON", {
        error: error instanceof Error ? error.message : error,
      });
      outputResponse();
      process.exit(1);
    }

    hookName = hookInput.hookName;
    taskId = hookInput.taskId;

    if (!hookName) {
      logger.error("Cline hook missing hookName", { taskId });
      outputResponse();
      process.exit(1);
    }

    logger.info(`Cline hook: ${hookName} (task: ${taskId})`);

    if (hookName === "PostToolUse") {
      await handlePostToolUse(hookInput);
    } else if (hookName === "TaskComplete" || hookName === "TaskCancel") {
      await handleTaskEnd(hookInput);
    } else {
      logger.debug(`Cline hook: skipping unsupported event ${hookName}`);
    }

    outputResponse();

    const duration = Date.now() - startTime;
    logger.info(`Cline hook completed: ${hookName} (${duration}ms)`, { taskId });
    process.exit(0);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Cline hook failed: ${hookName || "unknown"} (${duration}ms)`, {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    outputResponse();
    process.exit(1);
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

async function handlePostToolUse(hookInput: ClineHookInput): Promise<void> {
  const { taskId, postToolUse, workspaceRoots } = hookInput;
  if (!postToolUse) return;

  const { toolName, parameters, result } = postToolUse;
  if (toolName !== "execute_command") return;

  const command = typeof parameters.command === "string" ? parameters.command : undefined;
  if (!command || !containsGitCommit(command)) return;
  if (!result) return;

  const cwd = workspaceRoots?.[0];
  const repoId = await getRepoIdFromCwd(cwd);
  if (!isRepoAllowed(repoId)) {
    logger.debug("PostToolUse: repo not allowed", { taskId });
    return;
  }

  const transcriptId = await getOrCreateTranscriptId(taskId);

  const commitSha = parseCommitShaFromOutput(result);
  const commitTitle = parseCommitTitleFromOutput(result);
  const branch = parseBranchFromOutput(result);

  if (!commitSha) {
    logger.debug("PostToolUse: no commit SHA found in output", { taskId });
    return;
  }

  await trackCommit({
    transcriptId,
    repoPath: cwd || "",
    timestamp: new Date().toISOString(),
    commitSha,
    commitTitle,
    branch,
  });

  logger.info("PostToolUse: tracked commit", {
    taskId,
    transcriptId: transcriptId.substring(0, 8),
    commitSha: commitSha.substring(0, 8),
  });
}

async function handleTaskEnd(hookInput: ClineHookInput): Promise<void> {
  const { taskId, workspaceRoots } = hookInput;

  const taskDir = join(CLINE_TASKS_DIR, taskId);
  const conversationPath = join(taskDir, "api_conversation_history.json");

  if (!existsSync(conversationPath)) {
    logger.error(`TaskEnd: conversation file not found`, { taskId, path: conversationPath });
    return;
  }

  let messages: ClineMessage[];
  try {
    messages = JSON.parse(readFileSync(conversationPath, "utf-8")) as ClineMessage[];
  } catch (error) {
    logger.error("TaskEnd: failed to parse conversation file", {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  // Load metadata
  let metadata: ClineTaskMetadata | undefined;
  const metadataPath = join(taskDir, "task_metadata.json");
  if (existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(readFileSync(metadataPath, "utf-8")) as ClineTaskMetadata;
    } catch {
      // Skip invalid metadata
    }
  }

  const cwd = workspaceRoots?.[0] || process.cwd();

  // Fetch pricing
  const pricingFetcher = new LiteLLMPricingFetcher();
  const pricingData = await pricingFetcher.fetchModelPricing();
  const pricing = Object.fromEntries(pricingData);

  // Git context
  const gitContext = await resolveGitContext(cwd, undefined);

  const clientVersion = metadata?.environment_history?.[0]?.cline_version;

  // Convert
  const result = convertClineTranscript(messages, {
    pricing,
    gitContext,
    cwd,
    taskId,
    metadata,
    clientVersion,
  });

  if (!result) {
    logger.error("TaskEnd: failed to convert transcript", { taskId });
    return;
  }

  // Prepare blobs
  const uploadBlobs: UploadBlob[] = [];
  for (const [sha256, blob] of result.blobs) {
    uploadBlobs.push({
      sha256,
      data: new Uint8Array(blob.data),
      mediaType: blob.mediaType,
    });
  }

  // Upload
  const uploadResult = await uploadUnifiedToAllEnvs({
    unifiedTranscript: result.transcript,
    sessionId: taskId,
    cwd,
    rawTranscript: JSON.stringify(messages),
    blobs: uploadBlobs.length > 0 ? uploadBlobs : undefined,
  });

  if (uploadResult.skipped) {
    logger.info("TaskEnd: skipped (repo not allowed)", { taskId });
    return;
  }

  if (uploadResult.anySuccess && uploadResult.id) {
    for (const envResult of uploadResult.results) {
      if (envResult.success) {
        logger.info(`TaskEnd: uploaded to ${envResult.envName}`, {
          taskId,
          transcriptId: uploadResult.id.substring(0, 8),
        });
      } else if (envResult.error) {
        logger.error(`TaskEnd: upload to ${envResult.envName} failed`, {
          taskId,
          error: envResult.error,
        });
      }
    }
  } else {
    for (const envResult of uploadResult.results) {
      if (!envResult.success && envResult.error) {
        logger.error(`TaskEnd: upload failed`, { taskId, env: envResult.envName, error: envResult.error });
      }
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function outputResponse(): void {
  process.stdout.write(JSON.stringify({ cancel: false }));
}
