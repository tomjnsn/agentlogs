import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { type ClineMessage, convertClineTranscript } from "./cline";

const FIXTURES_DIR = join(import.meta.dir, "../../../fixtures/cline");

function loadFixture(name: string): ClineMessage[] {
  const content = readFileSync(join(FIXTURES_DIR, name), "utf8");
  return JSON.parse(content) as ClineMessage[];
}

describe("convertClineTranscript", () => {
  test("converts crud fixture", () => {
    const messages = loadFixture("crud.json");
    const result = convertClineTranscript(messages, {
      taskId: "1770913324799",
      cwd: "/Users/bee/dev/agentlogs",
      now: new Date("2026-02-12T16:22:08.000Z"),
    });

    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected result to be non-null");
    const transcript = result.transcript;

    expect(transcript.source).toBe("cline");
    expect(transcript.id).toBe("1770913324799");
    expect(transcript.model).toBe("anthropic/claude-opus-4-6");

    // Should have user messages, agent messages, and tool calls
    const userMessages = transcript.messages.filter((m) => m.type === "user");
    const toolCalls = transcript.messages.filter((m) => m.type === "tool-call");

    expect(userMessages.length).toBeGreaterThan(0);
    expect(toolCalls.length).toBeGreaterThan(0);

    // First user message should be the task prompt (extracted from <task> tags)
    expect(userMessages[0].text).toContain("tell me abouth this repo");

    // Should have token usage
    expect(transcript.tokenUsage.inputTokens).toBeGreaterThan(0);
    expect(transcript.tokenUsage.outputTokens).toBeGreaterThan(0);

    // Should have model usage
    expect(transcript.modelUsage.length).toBeGreaterThan(0);
    expect(transcript.modelUsage[0].model).toBe("anthropic/claude-opus-4-6");

    // Preview should be derived from first user message
    expect(transcript.preview).toContain("tell me abouth this repo");
  });

  test("extracts client version from metadata", () => {
    const messages = loadFixture("crud.json");
    const result = convertClineTranscript(messages, {
      taskId: "test-task",
      metadata: {
        environment_history: [
          {
            ts: 1770913324842,
            cline_version: "3.58.0",
          },
        ],
      },
    });

    expect(result).not.toBeNull();
    expect(result!.transcript.clientVersion).toBe("3.58.0");
  });

  test("filters out system-injected text", () => {
    const messages = loadFixture("crud.json");
    const result = convertClineTranscript(messages, {
      taskId: "test-task",
      cwd: "/Users/bee/dev/agentlogs",
    });

    expect(result).not.toBeNull();
    const userMessages = result!.transcript.messages.filter((m) => m.type === "user");

    // None of the user messages should contain environment_details
    for (const msg of userMessages) {
      expect(msg.text).not.toContain("<environment_details>");
      expect(msg.text).not.toContain("# TODO LIST UPDATE REQUIRED");
    }
  });

  test("strips task_progress from tool inputs", () => {
    const messages = loadFixture("crud.json");
    const result = convertClineTranscript(messages, {
      taskId: "test-task",
      cwd: "/Users/bee/dev/agentlogs",
    });

    expect(result).not.toBeNull();
    const toolCalls = result!.transcript.messages.filter((m) => m.type === "tool-call");

    // No tool call should have task_progress in its input
    for (const tc of toolCalls) {
      if (tc.type === "tool-call" && tc.input && typeof tc.input === "object") {
        expect((tc.input as Record<string, unknown>).task_progress).toBeUndefined();
      }
    }
  });

  test("returns null for empty input", () => {
    expect(convertClineTranscript([])).toBeNull();
    expect(convertClineTranscript(null as any)).toBeNull();
  });

  test("maps tool names correctly", () => {
    const messages: ClineMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "<task>\ntest task\n</task>" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool1",
            name: "read_file",
            input: { path: "README.md" },
          },
          {
            type: "tool_use",
            id: "tool2",
            name: "execute_command",
            input: { command: "ls -la" },
          },
          {
            type: "tool_use",
            id: "tool3",
            name: "search_files",
            input: { regex: "TODO", path: "src" },
          },
        ],
        modelInfo: { modelId: "claude-sonnet-4", providerId: "anthropic" },
        metrics: { tokens: { prompt: 100, completion: 50, cached: 0 } },
      },
    ];

    const result = convertClineTranscript(messages, { taskId: "test" });
    expect(result).not.toBeNull();

    const toolCalls = result!.transcript.messages.filter((m) => m.type === "tool-call");
    expect(toolCalls.length).toBe(3);

    const toolNames = toolCalls.map((tc) => (tc as any).toolName);
    expect(toolNames).toContain("Read");
    expect(toolNames).toContain("Bash");
    expect(toolNames).toContain("Grep");

    // Grep should have pattern instead of regex
    const grepCall = toolCalls.find((tc) => (tc as any).toolName === "Grep");
    expect((grepCall as any).input.pattern).toBe("TODO");
    expect((grepCall as any).input.regex).toBeUndefined();
  });
});
