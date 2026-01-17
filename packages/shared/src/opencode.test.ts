import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { convertOpenCodeTranscript, type OpenCodeExport } from "./opencode";
import { formatCwdWithTilde } from "./paths";

const FIXTURE_DIR = path.resolve(import.meta.dir, "../../../fixtures/opencode");

const TEST_NOW = new Date("2026-01-15T12:00:00Z");

const TEST_PRICING = {
  "openai/gpt-5.2-codex": {
    input_cost_per_token: 1.25e-6,
    output_cost_per_token: 5e-6,
    cache_read_input_token_cost: 3.125e-7,
  },
};

async function loadFixture(filename: string): Promise<OpenCodeExport> {
  const filePath = path.join(FIXTURE_DIR, filename);
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as OpenCodeExport;
}

const TEST_GIT_CONTEXT = {
  repo: "github.com/agentlogs/agentlogs",
  branch: "main",
  relativeCwd: null,
};

async function loadAndConvert(filename: string) {
  const data = await loadFixture(filename);
  const result = convertOpenCodeTranscript(data, {
    now: TEST_NOW,
    pricing: TEST_PRICING,
    gitContext: TEST_GIT_CONTEXT,
  });
  return result;
}

function serializeTranscript(transcript: NonNullable<ReturnType<typeof convertOpenCodeTranscript>>) {
  return {
    ...transcript,
    timestamp: transcript.timestamp.toISOString(),
  };
}

describe("convertOpenCodeTranscript", () => {
  test("crud.json", async () => {
    const transcript = await loadAndConvert("crud.json");
    expect(transcript).not.toBeNull();

    const serialized = serializeTranscript(transcript!);
    expect(serialized.cwd).toBe(formatCwdWithTilde("~/dev/agentlogs"));
    expect(serialized).toMatchInlineSnapshot(`
      {
        "blendedTokens": 18924,
        "costUsd": 0.047218750000000004,
        "cwd": "~/dev/agentlogs",
        "filesChanged": 1,
        "git": {
          "branch": "main",
          "relativeCwd": null,
          "repo": "github.com/agentlogs/agentlogs",
        },
        "id": "ses_450b70e67ffeoaXH496F8i0fVA",
        "linesAdded": 7,
        "linesModified": 1,
        "linesRemoved": 0,
        "messageCount": 6,
        "messages": [
          {
            "id": "msg_baf48f19a001Bt3EEPzRxclLuC",
            "text": "create a file JOKE.md with a random joke with a title and a footer with some random text, then read this file, then make change to the file, then delete the file.",
            "timestamp": "2026-01-11T22:59:11.902Z",
            "type": "user",
          },
          {
            "error": undefined,
            "id": "call_5FYki1ZoTLYkanx60w7fuvAX",
            "input": {
              "content": 
      "# The Elevator

      Why did the elevator break up with the staircase?
      It felt the relationship was going nowhere fast.

      ---
      Just a random footer line."
      ,
              "file_path": "./JOKE.md",
            },
            "isError": false,
            "model": "openai/gpt-5.2-codex",
            "output": {
              "created": true,
            },
            "timestamp": "2026-01-11T22:59:11.908Z",
            "toolName": "Write",
            "type": "tool-call",
          },
          {
            "error": undefined,
            "id": "call_mO9J7UcA7rft4D8zUXSxS4nL",
            "input": {
              "file_path": "./JOKE.md",
            },
            "isError": false,
            "model": "openai/gpt-5.2-codex",
            "output": {
              "content": 
      "# The Elevator

      Why did the elevator break up with the staircase?
      It felt the relationship was going nowhere fast.

      ---
      Just a random footer line."
      ,
            },
            "timestamp": "2026-01-11T22:59:17.149Z",
            "toolName": "Read",
            "type": "tool-call",
          },
          {
            "error": undefined,
            "id": "call_AzA1yNZKBASsQGiBlGCAJJdc",
            "input": {
              "file_path": "./JOKE.md",
              "newString": "Footer: totally unrelated text.",
              "oldString": "Just a random footer line.",
            },
            "isError": false,
            "model": "openai/gpt-5.2-codex",
            "output": {
              "additions": 1,
              "deletions": 1,
              "diff": 
      "Index: /Users/philipp/dev/agentlogs/JOKE.md
      ===================================================================
      --- /Users/philipp/dev/agentlogs/JOKE.md
      +++ /Users/philipp/dev/agentlogs/JOKE.md
      @@ -3,5 +3,5 @@
       Why did the elevator break up with the staircase?
       It felt the relationship was going nowhere fast.
       
       ---
      -Just a random footer line.
      \\ No newline at end of file
      +Footer: totally unrelated text.
      \\ No newline at end of file
      "
      ,
            },
            "timestamp": "2026-01-11T22:59:18.514Z",
            "toolName": "Edit",
            "type": "tool-call",
          },
          {
            "error": undefined,
            "id": "call_POT8dJbvw37zVltWEQww460Q",
            "input": {
              "command": "rm "/Users/philipp/dev/agentlogs/JOKE.md"",
              "description": "Delete the JOKE.md file",
            },
            "isError": false,
            "model": "openai/gpt-5.2-codex",
            "output": {
              "description": "Delete the JOKE.md file",
              "exitCode": 0,
              "stdout": "",
            },
            "timestamp": "2026-01-11T22:59:21.111Z",
            "toolName": "Bash",
            "type": "tool-call",
          },
          {
            "id": "msg_baf491bb5001iGYYlAIx76nKgI",
            "model": "openai/gpt-5.2-codex",
            "text": "All done: created \`JOKE.md\`, read it, updated the footer, and deleted the file. Want me to recreate it with a different joke or format?",
            "timestamp": "2026-01-11T22:59:22.677Z",
            "type": "agent",
          },
        ],
        "model": "openai/gpt-5.2-codex",
        "modelUsage": [
          {
            "model": "openai/gpt-5.2-codex",
            "usage": {
              "cachedInputTokens": 71936,
              "inputTokens": 18635,
              "outputTokens": 289,
              "reasoningOutputTokens": 64,
              "totalTokens": 18924,
            },
          },
        ],
        "preview": "create a file JOKE.md with a random joke with a title and a footer with some random text, then read this file, then make change to the file, then delete the file.",
        "source": "opencode",
        "summary": null,
        "timestamp": "2026-01-11T22:59:11.896Z",
        "tokenUsage": {
          "cachedInputTokens": 71936,
          "inputTokens": 18635,
          "outputTokens": 289,
          "reasoningOutputTokens": 64,
          "totalTokens": 18924,
        },
        "toolCount": 4,
        "userMessageCount": 1,
        "v": 1,
      }
    `);
  });
});
