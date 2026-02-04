import type { UnifiedTranscript, UnifiedTranscriptMessage } from "./claudecode";

/**
 * Patterns for files that should have their contents fully redacted.
 * These are files commonly known to contain secrets.
 */
export const SENSITIVE_FILE_PATTERNS: Array<string | RegExp> = [
  // Environment files
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".env.staging",
  /\.env\.(dev|prod|stage|preview|ci|build|docker)$/i,

  // Shell configuration
  ".zshrc",
  ".bashrc",
  ".bash_profile",
  ".profile",
  ".zprofile",
  ".zshenv",
  ".zsh_history",
  ".bash_history",

  // SSH and GPG
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "id_dsa",
  /^id_[a-z0-9]+$/i,
  /\.pem$/i,
  /\.key$/i,

  // AWS credentials
  ".aws/credentials",
  ".aws/config",

  // Docker secrets
  ".docker/config.json",

  // NPM/Yarn tokens
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",

  // Git credentials
  ".git-credentials",
  ".netrc",

  // Kubernetes
  ".kube/config",
  "kubeconfig",

  // Database configurations often contain secrets
  "database.yml",
  "secrets.yml",
  "secrets.yaml",

  // Application secrets
  "master.key",
  "credentials.yml.enc",

  // Cloud provider configs
  ".gcloud/credentials",
  "service-account.json",
  "service_account.json",
  /gcp.*credentials.*\.json$/i,
  /firebase.*\.json$/i,
];

/**
 * Check if a file path matches any sensitive file pattern.
 */
export function isSensitiveFile(filePath: string): boolean {
  // Extract just the filename and also check full path for directory patterns
  const normalizedPath = filePath.replace(/\\/g, "/");
  const filename = normalizedPath.split("/").pop() || "";

  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (typeof pattern === "string") {
      // Check if filename matches exactly or path ends with the pattern
      if (filename === pattern || normalizedPath.endsWith(`/${pattern}`) || normalizedPath === pattern) {
        return true;
      }
    } else {
      // RegExp pattern - test against both filename and full path
      if (pattern.test(filename) || pattern.test(normalizedPath)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Redact content by replacing non-whitespace characters with asterisks.
 * Preserves whitespace (spaces, tabs, newlines) to maintain structure.
 */
export function redactContent(content: string): string {
  return content.replace(/[^\s]/g, "*");
}

/**
 * Redact sensitive file contents in Read and Write tool calls within a UnifiedTranscript.
 * This creates a deep copy with redacted content.
 */
export function redactSensitiveFilesInTranscript(transcript: UnifiedTranscript): UnifiedTranscript {
  const redactedMessages = transcript.messages.map((message) => redactSensitiveFileInMessage(message));

  return {
    ...transcript,
    messages: redactedMessages,
  };
}

/**
 * Redact sensitive file content in a single message if it's a Read or Write tool call.
 */
export function redactSensitiveFileInMessage(message: UnifiedTranscriptMessage): UnifiedTranscriptMessage {
  if (message.type !== "tool-call") {
    return message;
  }

  const toolName = message.toolName;
  if (toolName !== "Read" && toolName !== "Write") {
    return message;
  }

  const input = message.input as Record<string, unknown> | undefined;
  const filePath = input?.file_path;

  if (typeof filePath !== "string" || !isSensitiveFile(filePath)) {
    return message;
  }

  // Create a copy with redacted content
  const redactedMessage = { ...message };

  if (toolName === "Write" && input) {
    // Redact content in input
    const inputContent = input.content;
    if (typeof inputContent === "string") {
      redactedMessage.input = {
        ...input,
        content: redactContent(inputContent),
      };
    }
  }

  if (toolName === "Read") {
    // Redact content in output
    const output = message.output;

    if (typeof output === "string") {
      // Simple string output
      redactedMessage.output = redactContent(output);
    } else if (output && typeof output === "object") {
      // Structured output with file.content
      const outputObj = output as Record<string, unknown>;
      const file = outputObj.file as Record<string, unknown> | undefined;

      if (file && typeof file.content === "string") {
        redactedMessage.output = {
          ...outputObj,
          file: {
            ...file,
            content: redactContent(file.content),
          },
        };
      }
    }
  }

  return redactedMessage;
}
