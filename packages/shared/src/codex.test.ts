import path from "node:path";
import { describe, expect, test } from "bun:test";
import type { ConversionResult } from "./claudecode";
import { convertCodexFile } from "./codex";
import { formatCwdWithTilde } from "./paths";
import type { LiteLLMModelPricing } from "./pricing";

const FIXTURE_DIR = path.resolve(import.meta.dir, "../../../fixtures/codex");
const TEST_NOW = new Date("2025-10-17T23:00:00Z");
const TEST_PRICING: Record<string, LiteLLMModelPricing> = {
  "gpt-5-codex": {
    cache_read_input_token_cost: 1.25e-7,
    input_cost_per_token: 0.00000125,
    output_cost_per_token: 0.00001,
  },
};

describe("convertCodexFile", () => {
  test("crud.jsonl", async () => {
    const serialized = await loadSerializedTranscript("crud.jsonl");
    expect(serialized.transcript.cwd).toBe(formatCwdWithTilde("/Users/philipp/dev/vibeinsights/fixtures"));
    expect(serialized).toMatchInlineSnapshot(`
      {
        "blobs": {
          "count": 0,
          "sha256s": [],
        },
        "transcript": {
          "blendedTokens": 7697,
          "costUsd": 0.054657250000000004,
          "cwd": "~/dev/vibeinsights/fixtures",
          "filesChanged": 1,
          "git": {
            "branch": "main",
            "relativeCwd": "fixtures",
            "repo": "github.com/vibeinsights/vibeinsights",
          },
          "id": "0199f433-233e-74b0-80d8-b9ef1b9fabd7",
          "linesAdded": 2,
          "linesRemoved": 2,
          "messageCount": 11,
          "messages": [
            {
              "text": "create a file \`JOKE.md\` with a random joke with a title and a footer with some random text, then read this file, then make change to the file, then delete the file.",
              "timestamp": "2025-10-17T22:03:54.811Z",
              "type": "user",
            },
            {
              "model": "gpt-5-codex",
              "text": "**Planning multi-step file operations** I'll create a multi-step approach to create, read, modify, and delete a file named JOKE.md using shell commands and apply_patch, ensuring each step follows instructions and the environment setup with bash in the specified working directory.",
              "timestamp": "2025-10-17T22:04:07.368Z",
              "type": "thinking",
            },
            {
              "id": "call_AesrALvhA1lH4IRySGLoM8jj",
              "input": {
                "content": 
      "# The Invisible Bicycle

      I tried to ride an invisible bike today. I couldn't see it coming when I crashed into thin air.

      ---

      Footer: Mind the invisible potholes.
      "
      ,
                "file_path": "./JOKE.md",
              },
              "model": "gpt-5-codex",
              "output": undefined,
              "timestamp": "2025-10-17T22:04:07.368Z",
              "toolName": "Write",
              "type": "tool-call",
            },
            {
              "model": "gpt-5-codex",
              "text": "**Reading file contents**",
              "timestamp": "2025-10-17T22:04:09.039Z",
              "type": "thinking",
            },
            {
              "id": "call_bL8fv2kzcwiqF3xGFKT01WZR",
              "input": {
                "file_path": "./JOKE.md",
              },
              "model": "gpt-5-codex",
              "output": 
      "# The Invisible Bicycle

      I tried to ride an invisible bike today. I couldn't see it coming when I crashed into thin air.

      ---

      Footer: Mind the invisible potholes."
      ,
              "timestamp": "2025-10-17T22:04:09.039Z",
              "toolName": "Read",
              "type": "tool-call",
            },
            {
              "model": "gpt-5-codex",
              "text": "**Updating joke content**",
              "timestamp": "2025-10-17T22:04:13.393Z",
              "type": "thinking",
            },
            {
              "id": "call_bT3EiO3FSsAgovw9CiNXqWMH",
              "input": {
                "diff": 
      "@@
      -I tried to ride an invisible bike today. I couldn't see it coming when I crashed into thin air.
      +I told my friend about my invisible bike. He said he couldn't handle it—apparently the handlebars were missing.
      @@
      -Footer: Mind the invisible potholes.
      +Footer: Watch out for translucent traffic lights.
      "
      ,
                "file_path": "./JOKE.md",
              },
              "model": "gpt-5-codex",
              "output": {
                "exitCode": 0,
                "message": 
      "Success. Updated the following files:
      M JOKE.md"
      ,
              },
              "timestamp": "2025-10-17T22:04:13.393Z",
              "toolName": "Edit",
              "type": "tool-call",
            },
            {
              "model": "gpt-5-codex",
              "text": "**Removing file**",
              "timestamp": "2025-10-17T22:04:15.278Z",
              "type": "thinking",
            },
            {
              "id": "call_Gf4EHYjxCQYPqhY6wa7mBXBS",
              "input": {
                "command": [
                  "bash",
                  "-lc",
                  "rm JOKE.md",
                ],
                "workdir": ".",
              },
              "model": "gpt-5-codex",
              "output": {
                "exitCode": 0,
              },
              "timestamp": "2025-10-17T22:04:15.278Z",
              "toolName": "Bash",
              "type": "tool-call",
            },
            {
              "model": "gpt-5-codex",
              "text": "**Summarizing file operations and finalizing response** I'll recap the sequence of actions on \`JOKE.md\`: creating it with initial content, reading and verifying what was inside, updating the joke text before finally deleting the file. Since the file no longer exists, I can’t show the final content but will confirm its removal and note that no tests or next steps are needed. This overview will help provide a clear, easy-to-follow summary for the user.",
              "timestamp": "2025-10-17T22:04:23.055Z",
              "type": "thinking",
            },
            {
              "model": "gpt-5-codex",
              "text": "- Created \`JOKE.md\` with the title “The Invisible Bicycle,” a short gag about crashing into thin air, and a footer warning about invisible potholes. - Read the file back to confirm the initial content matched the request. - Updated the body to a new punch line about missing handlebars and changed the footer to “Watch out for translucent traffic lights.” - Removed \`JOKE.md\` when finished, leaving no lingering artifacts. No further action needed.",
              "timestamp": "2025-10-17T22:04:23.055Z",
              "type": "agent",
            },
          ],
          "model": "gpt-5-codex",
          "modelUsage": [
            {
              "model": "gpt-5-codex",
              "usage": {
                "cachedInputTokens": 72448,
                "inputTokens": 76033,
                "outputTokens": 2384,
                "reasoningOutputTokens": 1728,
                "totalTokens": 78417,
              },
            },
          ],
          "preview": "create a file \`JOKE.md\` with a random joke with a title and a footer with some random text, then read this file, then make change to the file, then delete the file.",
          "source": "codex",
          "summary": null,
          "timestamp": "2025-10-17T22:04:23.055Z",
          "tokenUsage": {
            "cachedInputTokens": 72448,
            "inputTokens": 76033,
            "outputTokens": 2384,
            "reasoningOutputTokens": 1728,
            "totalTokens": 78417,
          },
          "toolCount": 4,
          "userMessageCount": 1,
          "v": 1,
        },
      }
      `);
  });
});

async function loadSerializedTranscript(fileName: string) {
  const transcript = await convertCodexFile(path.join(FIXTURE_DIR, fileName), {
    now: TEST_NOW,
    pricing: TEST_PRICING,
  });

  expect(transcript).not.toBeNull();
  return serializeResult(transcript!);
}

function serializeResult(result: ConversionResult) {
  return {
    transcript: {
      ...result.transcript,
      timestamp: result.transcript.timestamp.toISOString(),
    },
    blobs: {
      count: result.blobs.size,
      sha256s: [...result.blobs.keys()].sort(),
    },
  };
}
