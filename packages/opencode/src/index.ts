/**
 * AgentLogs OpenCode Plugin
 *
 * Automatically captures and uploads transcripts from OpenCode sessions.
 * Also enhances git commits with transcript links.
 *
 * @example
 * // opencode.json
 * {
 *   "plugin": ["@agentlogs/opencode-plugin"]
 * }
 *
 * @example
 * // Environment variables
 * VI_AUTH_TOKEN=your_auth_token
 * VI_SERVER_URL=https://agentlogs.ai  // optional
 */

import type { OpenCodeExport, OpenCodeMessage, OpenCodePart, OpenCodeSessionInfo } from "@agentlogs/shared";
import { appendTranscriptLinkToCommit, extractGitContext, isGitCommitCommand, type PluginContext } from "./git";
import { buildTranscriptUrl, uploadOpenCodeTranscript } from "./upload";

// ============================================================================
// Types
// ============================================================================

/**
 * OpenCode plugin interface (based on @opencode-ai/plugin)
 */
export interface Plugin {
  (ctx: OpenCodePluginContext): Promise<PluginHooks>;
}

export interface OpenCodePluginContext extends PluginContext {
  project?: {
    id: string;
    path: string;
  };
  client?: OpenCodeClient;
}

/**
 * OpenCode client SDK interface
 */
export interface OpenCodeClient {
  session: {
    get: (args: { path: { id: string } }) => Promise<OpenCodeSessionInfo | null>;
    messages: (args: { path: { id: string } }) => Promise<OpenCodeMessage[]>;
  };
}

export interface PluginHooks {
  event?: (event: PluginEvent) => Promise<void>;
  tool?: {
    execute?: {
      before?: (args: ToolExecuteArgs) => Promise<ToolExecuteArgs>;
      after?: (args: ToolExecuteArgs, result: unknown) => Promise<unknown>;
    };
  };
}

/**
 * Session created event from OpenCode
 */
export interface SessionCreatedEvent {
  type: "session.created";
  properties: {
    info: OpenCodeSessionInfo;
  };
}

/**
 * Message updated event from OpenCode
 */
export interface MessageUpdatedEvent {
  type: "message.updated";
  properties: {
    info: OpenCodeMessage["info"];
  };
}

/**
 * Message part updated event from OpenCode
 */
export interface MessagePartUpdatedEvent {
  type: "message.part.updated";
  properties: {
    part: OpenCodePart & { messageID: string };
  };
}

/**
 * Session idle event from OpenCode
 */
export interface SessionIdleEvent {
  type: "session.idle";
  properties: {
    sessionID: string;
  };
}

/**
 * Generic plugin event
 */
export interface PluginEvent {
  type: string;
  properties?: unknown;
}

export interface ToolExecuteArgs {
  name: string;
  input: unknown;
  [key: string]: unknown;
}

// ============================================================================
// Plugin State
// ============================================================================

interface CollectedMessage {
  info: OpenCodeMessage["info"];
  parts: OpenCodePart[];
}

interface PluginState {
  pendingTranscriptId: string | null;
  isUploading: boolean;
  // Event collection state
  sessionInfo: OpenCodeSessionInfo | null;
  messagesById: Map<string, CollectedMessage>;
}

// ============================================================================
// Main Plugin
// ============================================================================

/**
 * AgentLogs plugin for OpenCode.
 *
 * Features:
 * - Automatically uploads transcripts when sessions become idle
 * - Enhances git commits with transcript links
 * - Collects transcript data via events (no subprocess needed)
 */
export const agentLogsPlugin: Plugin = async (ctx) => {
  // Initialize state
  const state: PluginState = {
    pendingTranscriptId: null,
    isUploading: false,
    sessionInfo: null,
    messagesById: new Map(),
  };

  // Log plugin initialization
  console.log("[agentlogs] Plugin initialized");

  return {
    /**
     * Handle OpenCode events
     */
    event: async (event) => {
      try {
        switch (event.type) {
          case "session.created":
            handleSessionCreated(state, event as SessionCreatedEvent);
            break;

          case "message.updated":
            handleMessageUpdated(state, event as MessageUpdatedEvent);
            break;

          case "message.part.updated":
            handleMessagePartUpdated(state, event as MessagePartUpdatedEvent);
            break;

          case "session.idle":
            await handleSessionIdle(state, ctx, event as SessionIdleEvent);
            break;
        }
      } catch (error) {
        console.error("[agentlogs] Event handler error:", error);
      }
    },

    /**
     * Intercept tool execution
     */
    tool: {
      execute: {
        /**
         * Before tool execution - intercept git commits to add transcript link
         */
        before: async (args) => {
          try {
            // Check if this is a shell/bash tool with git commit
            if ((args.name === "shell" || args.name === "bash") && isGitCommitCommand(args.input)) {
              // If we have a pending transcript, add the link
              if (state.pendingTranscriptId) {
                const transcriptUrl = buildTranscriptUrl(state.pendingTranscriptId);
                const modifiedInput = appendTranscriptLinkToCommit(args.input, transcriptUrl);

                if (modifiedInput) {
                  console.log("[agentlogs] Added transcript link to commit message");
                  return { ...args, input: modifiedInput };
                }
              }
            }
          } catch (error) {
            console.error("[agentlogs] tool.execute.before error:", error);
          }

          return args;
        },
      },
    },
  };
};

// ============================================================================
// Event Handlers
// ============================================================================

function handleSessionCreated(state: PluginState, event: SessionCreatedEvent): void {
  state.sessionInfo = event.properties.info;
  // Clear any previous message collection
  state.messagesById.clear();
}

function handleMessageUpdated(state: PluginState, event: MessageUpdatedEvent): void {
  const info = event.properties.info;
  if (!info?.id) return;

  const existing = state.messagesById.get(info.id);
  if (existing) {
    // Update existing message info
    existing.info = info;
  } else {
    // Create new message entry
    state.messagesById.set(info.id, { info, parts: [] });
  }
}

function handleMessagePartUpdated(state: PluginState, event: MessagePartUpdatedEvent): void {
  const part = event.properties.part;
  if (!part?.messageID) return;

  const message = state.messagesById.get(part.messageID);
  if (!message) return;

  // Extract the part without messageID for storage
  const { messageID: _msgId, ...partData } = part;

  // Find existing part by id and update, or add new part
  const existingIdx = message.parts.findIndex((p: any) => p.id === partData.id);
  if (existingIdx >= 0) {
    message.parts[existingIdx] = partData as OpenCodePart;
  } else {
    message.parts.push(partData as OpenCodePart);
  }
}

async function handleSessionIdle(
  state: PluginState,
  ctx: OpenCodePluginContext,
  event: SessionIdleEvent,
): Promise<void> {
  // Don't upload if already uploading
  if (state.isUploading) {
    return;
  }

  const sessionID = event.properties.sessionID;

  console.log(`[agentlogs] Session idle, uploading transcript...`);

  state.isUploading = true;

  try {
    let exportData: OpenCodeExport | null = null;

    // Try client API first (recommended approach)
    if (ctx.client?.session) {
      try {
        const [sessionInfo, messages] = await Promise.all([
          ctx.client.session.get({ path: { id: sessionID } }),
          ctx.client.session.messages({ path: { id: sessionID } }),
        ]);

        if (sessionInfo && Array.isArray(messages) && messages.length > 0) {
          exportData = {
            info: sessionInfo,
            messages,
          };
          console.log(`[agentlogs] Got transcript via client API (${messages.length} messages)`);
        }
      } catch (apiError) {
        console.error("[agentlogs] Client API error, falling back to events:", apiError);
      }
    }

    // Fallback to event-based collection
    if (!exportData && state.sessionInfo && state.messagesById.size > 0) {
      const messages: OpenCodeMessage[] = Array.from(state.messagesById.values()).map(({ info, parts }) => ({
        info,
        parts,
      }));

      exportData = {
        info: state.sessionInfo,
        messages,
      };
      console.log(`[agentlogs] Using event-based collection (${messages.length} messages)`);
    }

    if (!exportData) {
      console.log("[agentlogs] No transcript data available, skipping upload");
      return;
    }

    // Extract git context
    const gitContext = await extractGitContext(ctx);

    // Upload transcript
    const uploadResult = await uploadOpenCodeTranscript({
      exportData,
      gitContext,
      cwd: ctx.directory,
    });

    if (uploadResult.success && uploadResult.transcriptId) {
      state.pendingTranscriptId = uploadResult.transcriptId;
      console.log(`[agentlogs] Transcript uploaded: ${uploadResult.transcriptUrl}`);
    } else if (uploadResult.error) {
      console.error(`[agentlogs] Upload failed: ${uploadResult.error}`);
    }
  } catch (error) {
    console.error("[agentlogs] Session idle handler error:", error);
  } finally {
    state.isUploading = false;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default agentLogsPlugin;
export { extractGitContext, isGitCommitCommand } from "./git";
export { uploadOpenCodeTranscript, buildTranscriptUrl } from "./upload";
