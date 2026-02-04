import { describe, expect, test } from "bun:test";
import type { UnifiedTranscript, UnifiedTranscriptMessage } from "./claudecode";
import {
  isSensitiveFile,
  redactContent,
  redactSensitiveFileInMessage,
  redactSensitiveFilesInTranscript,
} from "./redact-sensitive-files";

describe("isSensitiveFile", () => {
  test("matches .env files", () => {
    expect(isSensitiveFile(".env")).toBe(true);
    expect(isSensitiveFile(".env.local")).toBe(true);
    expect(isSensitiveFile(".env.development")).toBe(true);
    expect(isSensitiveFile(".env.production")).toBe(true);
    expect(isSensitiveFile(".env.test")).toBe(true);
    expect(isSensitiveFile(".env.staging")).toBe(true);
    // Common variations via regex pattern
    expect(isSensitiveFile(".env.dev")).toBe(true);
    expect(isSensitiveFile(".env.prod")).toBe(true);
  });

  test("matches .env files with paths", () => {
    expect(isSensitiveFile("./project/.env")).toBe(true);
    expect(isSensitiveFile("/home/user/project/.env.local")).toBe(true);
    expect(isSensitiveFile("packages/api/.env.production")).toBe(true);
  });

  test("matches shell configuration files", () => {
    expect(isSensitiveFile(".zshrc")).toBe(true);
    expect(isSensitiveFile(".bashrc")).toBe(true);
    expect(isSensitiveFile(".bash_profile")).toBe(true);
    expect(isSensitiveFile(".profile")).toBe(true);
    expect(isSensitiveFile(".zprofile")).toBe(true);
    expect(isSensitiveFile(".zshenv")).toBe(true);
    expect(isSensitiveFile("~/.zshrc")).toBe(true);
    expect(isSensitiveFile("/home/user/.bashrc")).toBe(true);
  });

  test("matches history files", () => {
    expect(isSensitiveFile(".zsh_history")).toBe(true);
    expect(isSensitiveFile(".bash_history")).toBe(true);
  });

  test("matches SSH key files", () => {
    expect(isSensitiveFile("id_rsa")).toBe(true);
    expect(isSensitiveFile("id_ed25519")).toBe(true);
    expect(isSensitiveFile("id_ecdsa")).toBe(true);
    expect(isSensitiveFile("id_dsa")).toBe(true);
    expect(isSensitiveFile("~/.ssh/id_rsa")).toBe(true);
    expect(isSensitiveFile("/home/user/.ssh/id_ed25519")).toBe(true);
  });

  test("matches key and PEM files", () => {
    expect(isSensitiveFile("server.key")).toBe(true);
    expect(isSensitiveFile("private.pem")).toBe(true);
    expect(isSensitiveFile("certificate.pem")).toBe(true);
    expect(isSensitiveFile("./certs/server.key")).toBe(true);
  });

  test("matches AWS credentials", () => {
    expect(isSensitiveFile(".aws/credentials")).toBe(true);
    expect(isSensitiveFile(".aws/config")).toBe(true);
    expect(isSensitiveFile("~/.aws/credentials")).toBe(true);
  });

  test("matches package manager configs", () => {
    expect(isSensitiveFile(".npmrc")).toBe(true);
    expect(isSensitiveFile(".yarnrc")).toBe(true);
    expect(isSensitiveFile(".yarnrc.yml")).toBe(true);
  });

  test("matches kubernetes configs", () => {
    expect(isSensitiveFile(".kube/config")).toBe(true);
    expect(isSensitiveFile("kubeconfig")).toBe(true);
  });

  test("matches secrets and credentials files", () => {
    expect(isSensitiveFile("secrets.yml")).toBe(true);
    expect(isSensitiveFile("secrets.yaml")).toBe(true);
    expect(isSensitiveFile("master.key")).toBe(true);
    expect(isSensitiveFile("credentials.yml.enc")).toBe(true);
    expect(isSensitiveFile("service-account.json")).toBe(true);
    expect(isSensitiveFile("service_account.json")).toBe(true);
  });

  test("does not match regular files", () => {
    expect(isSensitiveFile("package.json")).toBe(false);
    expect(isSensitiveFile("README.md")).toBe(false);
    expect(isSensitiveFile("src/index.ts")).toBe(false);
    expect(isSensitiveFile("config.ts")).toBe(false);
    expect(isSensitiveFile("environment.ts")).toBe(false);
    expect(isSensitiveFile(".envrc")).toBe(false); // direnv file, not a .env file
    expect(isSensitiveFile("test.env.bak")).toBe(false);
    expect(isSensitiveFile(".env.example")).toBe(false); // template files are safe to share
    expect(isSensitiveFile(".env.sample")).toBe(false);
    expect(isSensitiveFile(".env.template")).toBe(false);
  });
});

describe("redactContent", () => {
  test("replaces non-whitespace with asterisks", () => {
    expect(redactContent("secret")).toBe("******");
    expect(redactContent("API_KEY=sk-123456")).toBe("*****************"); // 17 chars
  });

  test("preserves whitespace characters", () => {
    expect(redactContent("key=value")).toBe("*********");
    expect(redactContent("key = value")).toBe("*** * *****");
    expect(redactContent("line1\nline2")).toBe("*****\n*****");
    expect(redactContent("col1\tcol2")).toBe("****\t****");
  });

  test("preserves structure with multiple lines", () => {
    const input = `export API_KEY="sk-12345"
export SECRET="mysecret"`;
    const expected = `****** ******************
****** *****************`;
    expect(redactContent(input)).toBe(expected);
  });

  test("handles empty string", () => {
    expect(redactContent("")).toBe("");
  });

  test("handles whitespace-only string", () => {
    expect(redactContent("   \n\t  ")).toBe("   \n\t  ");
  });
});

describe("redactSensitiveFileInMessage", () => {
  test("redacts Write tool call with sensitive file", () => {
    const message: UnifiedTranscriptMessage = {
      type: "tool-call",
      toolName: "Write",
      input: {
        file_path: ".env",
        content: "API_KEY=sk-12345\nSECRET=mysecret",
      },
      output: { type: "success" },
    };

    const redacted = redactSensitiveFileInMessage(message);

    expect(redacted.type).toBe("tool-call");
    expect((redacted as typeof message).toolName).toBe("Write");
    const input = (redacted as typeof message).input as Record<string, unknown>;
    expect(input.file_path).toBe(".env");
    expect(input.content).toBe("****************\n***************");
  });

  test("redacts Read tool call with string output", () => {
    const message: UnifiedTranscriptMessage = {
      type: "tool-call",
      toolName: "Read",
      input: {
        file_path: ".zshrc",
      },
      output: "export PATH=/usr/local/bin:$PATH",
    };

    const redacted = redactSensitiveFileInMessage(message);

    expect(redacted.type).toBe("tool-call");
    expect((redacted as typeof message).output).toBe("****** *************************");
  });

  test("redacts Read tool call with structured output", () => {
    const message: UnifiedTranscriptMessage = {
      type: "tool-call",
      toolName: "Read",
      input: {
        file_path: "/home/user/.bashrc",
      },
      output: {
        type: "file",
        file: {
          content: "export SECRET=abc123",
          numLines: 1,
          totalLines: 1,
        },
      },
    };

    const redacted = redactSensitiveFileInMessage(message);

    const output = (redacted as typeof message).output as Record<string, unknown>;
    const file = output.file as Record<string, unknown>;
    expect(file.content).toBe("****** *************");
    expect(file.numLines).toBe(1);
    expect(file.totalLines).toBe(1);
  });

  test("does not modify non-sensitive file Read", () => {
    const message: UnifiedTranscriptMessage = {
      type: "tool-call",
      toolName: "Read",
      input: {
        file_path: "package.json",
      },
      output: '{ "name": "test" }',
    };

    const redacted = redactSensitiveFileInMessage(message);

    expect(redacted).toEqual(message);
  });

  test("does not modify non-sensitive file Write", () => {
    const message: UnifiedTranscriptMessage = {
      type: "tool-call",
      toolName: "Write",
      input: {
        file_path: "src/config.ts",
        content: "export const config = {};",
      },
    };

    const redacted = redactSensitiveFileInMessage(message);

    expect(redacted).toEqual(message);
  });

  test("does not modify non-Read/Write tool calls", () => {
    const message: UnifiedTranscriptMessage = {
      type: "tool-call",
      toolName: "Bash",
      input: {
        command: "cat .env",
      },
      output: "API_KEY=secret",
    };

    const redacted = redactSensitiveFileInMessage(message);

    expect(redacted).toEqual(message);
  });

  test("does not modify user messages", () => {
    const message: UnifiedTranscriptMessage = {
      type: "user",
      text: "Please read the .env file",
    };

    const redacted = redactSensitiveFileInMessage(message);

    expect(redacted).toEqual(message);
  });

  test("does not modify agent messages", () => {
    const message: UnifiedTranscriptMessage = {
      type: "agent",
      text: "Here is the content of .env",
    };

    const redacted = redactSensitiveFileInMessage(message);

    expect(redacted).toEqual(message);
  });
});

describe("redactSensitiveFilesInTranscript", () => {
  const createMockTranscript = (messages: UnifiedTranscriptMessage[]): UnifiedTranscript => ({
    v: 1,
    id: "test-transcript",
    source: "claude-code",
    timestamp: new Date("2026-02-04T00:00:00Z"),
    preview: "Test transcript",
    summary: null,
    model: "claude-3-5-sonnet-20241022",
    clientVersion: "1.0.0",
    blendedTokens: 1000,
    costUsd: 0.01,
    messageCount: messages.length,
    toolCount: messages.filter((m) => m.type === "tool-call").length,
    userMessageCount: messages.filter((m) => m.type === "user").length,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    linesModified: 0,
    tokenUsage: {
      inputTokens: 500,
      cachedInputTokens: 0,
      outputTokens: 500,
      reasoningOutputTokens: 0,
      totalTokens: 1000,
    },
    modelUsage: [],
    git: null,
    cwd: "/test",
    messages,
  });

  test("redacts sensitive files in mixed transcript", () => {
    const transcript = createMockTranscript([
      {
        type: "user",
        text: "Please set up the environment",
      },
      {
        type: "tool-call",
        toolName: "Read",
        input: { file_path: ".env" },
        output: "DATABASE_URL=postgres://user:pass@localhost/db",
      },
      {
        type: "agent",
        text: "I found the database configuration",
      },
      {
        type: "tool-call",
        toolName: "Write",
        input: {
          file_path: ".env.local",
          content: "API_KEY=sk-12345",
        },
        output: { type: "success" },
      },
      {
        type: "tool-call",
        toolName: "Read",
        input: { file_path: "package.json" },
        output: '{ "name": "test" }',
      },
    ]);

    const redacted = redactSensitiveFilesInTranscript(transcript);

    // Check .env Read was redacted
    const envRead = redacted.messages[1] as UnifiedTranscriptMessage & { type: "tool-call" };
    expect(envRead.output).toBe("**********************************************");

    // Check .env.local Write was redacted
    const envWrite = redacted.messages[3] as UnifiedTranscriptMessage & { type: "tool-call" };
    const envWriteInput = envWrite.input as Record<string, unknown>;
    expect(envWriteInput.content).toBe("****************");

    // Check package.json was NOT redacted
    const pkgRead = redacted.messages[4] as UnifiedTranscriptMessage & { type: "tool-call" };
    expect(pkgRead.output).toBe('{ "name": "test" }');

    // Check other messages are unchanged
    expect(redacted.messages[0]).toEqual(transcript.messages[0]);
    expect(redacted.messages[2]).toEqual(transcript.messages[2]);
  });

  test("snapshot: full transcript redaction", () => {
    const transcript = createMockTranscript([
      {
        type: "user",
        text: "Read the configuration files",
      },
      {
        type: "tool-call",
        toolName: "Read",
        input: { file_path: ".zshrc" },
        output: {
          type: "file",
          file: {
            content: `export PATH="/usr/local/bin:$PATH"
export OPENAI_API_KEY="sk-proj-abc123"
alias ll="ls -la"`,
            numLines: 3,
            totalLines: 3,
          },
        },
      },
      {
        type: "tool-call",
        toolName: "Read",
        input: { file_path: ".aws/credentials" },
        output: {
          type: "file",
          file: {
            content: `[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`,
            numLines: 3,
            totalLines: 3,
          },
        },
      },
      {
        type: "tool-call",
        toolName: "Write",
        input: {
          file_path: ".env.production",
          content: `DATABASE_URL=postgres://admin:supersecret@db.example.com:5432/myapp
REDIS_URL=redis://:password@redis.example.com:6379
JWT_SECRET=my-super-secret-jwt-key-123`,
        },
        output: { type: "success" },
      },
      {
        type: "tool-call",
        toolName: "Read",
        input: { file_path: "README.md" },
        output: "# Project\n\nThis is a test project.",
      },
    ]);

    const redacted = redactSensitiveFilesInTranscript(transcript);

    // Snapshot the redacted messages
    expect(redacted.messages).toMatchSnapshot();
  });

  test("snapshot: SSH key redaction", () => {
    const transcript = createMockTranscript([
      {
        type: "tool-call",
        toolName: "Read",
        input: { file_path: "~/.ssh/id_rsa" },
        output: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy...
...many more lines of base64...
-----END RSA PRIVATE KEY-----`,
      },
      {
        type: "tool-call",
        toolName: "Write",
        input: {
          file_path: "deploy.pem",
          content: `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0Gcasd...
-----END CERTIFICATE-----`,
        },
        output: { type: "success" },
      },
    ]);

    const redacted = redactSensitiveFilesInTranscript(transcript);

    expect(redacted.messages).toMatchSnapshot();
  });

  test("preserves transcript metadata", () => {
    const transcript = createMockTranscript([
      {
        type: "tool-call",
        toolName: "Read",
        input: { file_path: ".env" },
        output: "SECRET=value",
      },
    ]);

    const redacted = redactSensitiveFilesInTranscript(transcript);

    expect(redacted.id).toBe(transcript.id);
    expect(redacted.source).toBe(transcript.source);
    expect(redacted.timestamp).toEqual(transcript.timestamp);
    expect(redacted.model).toBe(transcript.model);
    expect(redacted.tokenUsage).toEqual(transcript.tokenUsage);
    expect(redacted.git).toBe(transcript.git);
    expect(redacted.cwd).toBe(transcript.cwd);
  });
});
