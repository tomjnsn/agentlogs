import path from "node:path";
import { describe, expect, test } from "bun:test";
import { convertClaudeCodeFile, type UnifiedTranscript } from "./claudecode";

const FIXTURE_DIR = path.resolve(import.meta.dir, "../../../fixtures/claudecode");

const TEST_NOW = new Date("2025-10-15T12:00:00Z");

const TEST_PRICING = {
  "claude-sonnet-4-5-20250929": {
    input_cost_per_token: 3e-6,
    output_cost_per_token: 1.5e-5,
    cache_creation_input_token_cost: 3e-6,
    cache_read_input_token_cost: 3e-7,
  },
};

describe("convertClaudeCodeFile", () => {
  test("compact.jsonl", async () => {
    const serialized = await loadSerializedTranscript("compact.jsonl");
    expect(serialized).toMatchInlineSnapshot(`
      {
        "blendedTokens": 0,
        "costUsd": 0,
        "git": {
          "branch": "main",
          "relativeCwd": ".",
          "repo": "github.com/tailwindlabs/tailwind-studio",
        },
        "id": "0e26ec2f-937e-482c-b889-bc126f996913",
        "messageCount": 5,
        "messages": [
          {
            "id": "cff5fe4f-d7c3-4631-8580-3176d62c0e62",
            "text": "This session is being continued from a previous conversation that ran out of context. The conversation is summarized below: Analysis: Let me analyze the conversation chronologically: 1. **Message 1**: User ran \`/clear\` command (local command, should be ignored per instructions) 2. **Message 2**: User asked "how are you doing" 3. **Message 3**: I responded politely that I'm doing well and asked what they'd like to work on 4. **Message 4**: User is now requesting a detailed summary of the conversation This is a very brief conversation with minimal technical content. The user has: - Cleared the conversation history - Made a casual greeting - Requested a summary There have been NO: - Technical requests - File operations - Code changes - Errors - Problem solving - Pending tasks - Current work in progress The conversation literally just started after a clear command, so there is essentially nothing to summarize in terms of development work, technical decisions, or code patterns. Summary: 1. Primary Request and Intent: The user cleared the conversation history, made a casual greeting ("how are you doing"), and then requested a detailed summary of the conversation. There have been no explicit technical requests or development intents expressed in this conversation. 2. Key Technical Concepts: None discussed in this conversation. 3. Files and Code Sections: No files have been read, modified, or created in this conversation. 4. Errors and fixes: No errors encountered in this conversation. 5. Problem Solving: No problems have been addressed or troubleshooting efforts undertaken in this conversation. 6. All user messages: - "how are you doing" - [Current request for conversation summary] 7. Pending Tasks: No pending tasks have been identified or requested. 8. Current Work: No development work was being performed before this summary request. The conversation just began after a \`/clear\` command, with only a casual greeting exchange before the summary was requested. 9. Optional Next Step: None. There is no ongoing work to continue. Awaiting the user's next request or direction for what they would like to work on..",
            "timestamp": "2025-10-10T21:57:51.963Z",
            "type": "user",
          },
          {
            "id": "224e95a0-d3da-4754-9410-eadf74f8b03e",
            "text": "<command-name>/compact</command-name> <command-message>compact</command-message> <command-args></command-args>",
            "timestamp": "2025-10-10T21:57:40.406Z",
            "type": "user",
          },
          {
            "id": "6b911413-edc7-479e-83d0-acbaddbc8ba7",
            "text": "<local-command-stdout>\x1B[2mCompacted (ctrl+o to see full summary)\x1B[22m</local-command-stdout>",
            "timestamp": "2025-10-10T21:57:52.066Z",
            "type": "user",
          },
        ],
        "model": null,
        "modelUsage": [],
        "preview": "This session is being continued from a previous conversation that ran out of co…",
        "source": "claude-code",
        "timestamp": "2025-10-10T21:57:52.066Z",
        "tokenUsage": {
          "cachedInputTokens": 0,
          "inputTokens": 0,
          "outputTokens": 0,
          "reasoningOutputTokens": 0,
          "totalTokens": 0,
        },
        "v": 1,
      }
    `);
  });

  test("crud.jsonl", async () => {
    const serialized = await loadSerializedTranscript("crud.jsonl");
    expect(serialized).toMatchInlineSnapshot(`
      {
        "blendedTokens": 14126,
        "costUsd": 0.10516139999999999,
        "git": {
          "branch": "main",
          "relativeCwd": "fixtures/claudecode",
          "repo": "github.com/vibeinsights/vibeinsights",
        },
        "id": "8122657c-fe54-4dc9-89a3-20049e8a84f7",
        "messageCount": 25,
        "messages": [
          {
            "id": "03ffd31e-6bc0-4899-9df7-9b484cfda8cf",
            "text": "create a file \`JOKE.md\` with a ranom joke with a title and a footer wiht some random text, then read this file, then make change to the file, then delete this file.",
            "timestamp": "2025-10-12T21:35:53.825Z",
            "type": "user",
          },
          {
            "id": "msg_017DQYxTBUopfF6hAzwhgCfu",
            "model": "claude-sonnet-4-5-20250929",
            "text": "I'll help you create, read, modify, and delete a JOKE.md file. Let me break this down into steps:",
            "timestamp": "2025-10-12T21:35:57.104Z",
            "type": "agent",
          },
          {
            "id": "msg_017DQYxTBUopfF6hAzwhgCfu",
            "input": {
              "todos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "pending",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "pending",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "pending",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "pending",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "pending",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "pending",
                },
              ],
              "oldTodos": [],
            },
            "timestamp": "2025-10-12T21:35:59.363Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_01QNb8pLhv5fC4zzZCWWmETv",
            "model": "claude-sonnet-4-5-20250929",
            "text": "Now let me create the JOKE.md file:",
            "timestamp": "2025-10-12T21:36:02.923Z",
            "type": "agent",
          },
          {
            "id": "msg_01QNb8pLhv5fC4zzZCWWmETv",
            "input": {
              "content": 
      "# Why Don't Programmers Like Nature?

      Because it has too many bugs!

      ---

      *This joke brought to you by the Department of Computer Comedy. Remember, there are only 10 types of people in the world: those who understand binary and those who don't.*
      "
      ,
              "file_path": "./JOKE.md",
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "type": "create",
            },
            "timestamp": "2025-10-12T21:36:05.153Z",
            "toolName": "Write",
            "type": "tool-call",
          },
          {
            "id": "msg_01EPMD36Pf5TTces5YEB6XCp",
            "input": {
              "todos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "pending",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "pending",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "pending",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "pending",
                },
              ],
              "oldTodos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "pending",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "pending",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "pending",
                },
              ],
            },
            "timestamp": "2025-10-12T21:36:09.512Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_01JiNaWLgS4VrfjFK1y6uJ56",
            "model": "claude-sonnet-4-5-20250929",
            "text": "Now let me read the file:",
            "timestamp": "2025-10-12T21:36:13.201Z",
            "type": "agent",
          },
          {
            "id": "msg_01JiNaWLgS4VrfjFK1y6uJ56",
            "input": {
              "file_path": "./JOKE.md",
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "file": {
                "content": 
      "# Why Don't Programmers Like Nature?

      Because it has too many bugs!

      ---

      *This joke brought to you by the Department of Computer Comedy. Remember, there are only 10 types of people in the world: those who understand binary and those who don't.*
      "
      ,
                "numLines": 8,
                "startLine": 1,
                "totalLines": 8,
              },
              "type": "text",
            },
            "timestamp": "2025-10-12T21:36:13.605Z",
            "toolName": "Read",
            "type": "tool-call",
          },
          {
            "id": "msg_01JiRJzfyp6vaEWJxj26DagJ",
            "input": {
              "todos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "pending",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "pending",
                },
              ],
              "oldTodos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "pending",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "pending",
                },
              ],
            },
            "timestamp": "2025-10-12T21:36:17.703Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_01MwBdz2tFJGVscNoMYjucr1",
            "model": "claude-sonnet-4-5-20250929",
            "text": "Now let me make a change to the file:",
            "timestamp": "2025-10-12T21:36:20.048Z",
            "type": "agent",
          },
          {
            "id": "msg_01MwBdz2tFJGVscNoMYjucr1",
            "input": {
              "file_path": "./JOKE.md",
              "new_string": 
      "Because it has too many bugs! 🐛

      **Alternative answer:** They prefer their trees to be binary!"
      ,
              "old_string": "Because it has too many bugs!",
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "filePath": "./JOKE.md",
              "newString": 
      "Because it has too many bugs! 🐛

      **Alternative answer:** They prefer their trees to be binary!"
      ,
              "oldString": "Because it has too many bugs!",
              "originalFile": 
      "# Why Don't Programmers Like Nature?

      Because it has too many bugs!

      ---

      *This joke brought to you by the Department of Computer Comedy. Remember, there are only 10 types of people in the world: those who understand binary and those who don't.*
      "
      ,
              "replaceAll": false,
              "structuredPatch": [
                {
                  "lines": [
                    " # Why Don't Programmers Like Nature?",
                    " ",
                    "-Because it has too many bugs!",
                    "+Because it has too many bugs! 🐛",
                    " ",
                    "+**Alternative answer:** They prefer their trees to be binary!",
                    "+",
                    " ---",
                    " ",
                    " *This joke brought to you by the Department of Computer Comedy. Remember, there are only 10 types of people in the world: those who understand binary and those who don't.*",
                  ],
                  "newLines": 9,
                  "newStart": 1,
                  "oldLines": 7,
                  "oldStart": 1,
                },
              ],
              "userModified": false,
            },
            "timestamp": "2025-10-12T21:36:21.679Z",
            "toolName": "Edit",
            "type": "tool-call",
          },
          {
            "id": "msg_01YEVA42WgdVk4e8xtuHmYKM",
            "input": {
              "todos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "in_progress",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "in_progress",
                },
              ],
              "oldTodos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "pending",
                },
              ],
            },
            "timestamp": "2025-10-12T21:36:26.216Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_019eSytZmTcXtB5z3wBAP41E",
            "model": "claude-sonnet-4-5-20250929",
            "text": "Finally, let me delete the file:",
            "timestamp": "2025-10-12T21:36:30.007Z",
            "type": "agent",
          },
          {
            "id": "msg_019eSytZmTcXtB5z3wBAP41E",
            "input": {
              "command": "rm /Users/philipp/dev/vibeinsights/fixtures/claudecode/JOKE.md",
              "description": "Delete JOKE.md file",
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "interrupted": false,
              "isImage": false,
              "stderr": "",
              "stdout": "",
            },
            "timestamp": "2025-10-12T21:36:30.934Z",
            "toolName": "Bash",
            "type": "tool-call",
          },
          {
            "id": "msg_01M9UkWxCpEQ9nRSw47wTz5W",
            "input": {
              "todos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "completed",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "completed",
                },
              ],
              "oldTodos": [
                {
                  "activeForm": "Creating JOKE.md file with a joke, title, and footer",
                  "content": "Create JOKE.md file with a joke, title, and footer",
                  "status": "completed",
                },
                {
                  "activeForm": "Reading the JOKE.md file",
                  "content": "Read the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Making changes to the JOKE.md file",
                  "content": "Make changes to the JOKE.md file",
                  "status": "completed",
                },
                {
                  "activeForm": "Deleting the JOKE.md file",
                  "content": "Delete the JOKE.md file",
                  "status": "in_progress",
                },
              ],
            },
            "timestamp": "2025-10-12T21:36:35.652Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_01WDawW8oMKaYitz5hbU4qgg",
            "model": "claude-sonnet-4-5-20250929",
            "text": 
      "All done! I've completed all the steps:

      1. ✓ Created JOKE.md with a programming joke, title, and footer
      2. ✓ Read the file and displayed its contents
      3. ✓ Modified the file by adding an alternative punchline
      4. ✓ Deleted the file

      The file has been successfully removed from your working directory."
      ,
            "timestamp": "2025-10-12T21:36:39.886Z",
            "type": "agent",
          },
        ],
        "model": "claude-sonnet-4-5-20250929",
        "modelUsage": [
          {
            "model": "claude-sonnet-4-5-20250929",
            "usage": {
              "cachedInputTokens": 148958,
              "inputTokens": 161576,
              "outputTokens": 1508,
              "reasoningOutputTokens": 0,
              "totalTokens": 163084,
            },
          },
        ],
        "preview": "create a file \`JOKE.md\` with a ranom joke with a title and a footer wiht some r…",
        "source": "claude-code",
        "timestamp": "2025-10-12T21:36:39.886Z",
        "tokenUsage": {
          "cachedInputTokens": 148958,
          "inputTokens": 161576,
          "outputTokens": 1508,
          "reasoningOutputTokens": 0,
          "totalTokens": 163084,
        },
        "v": 1,
      }
    `);
  });

  test("subagent.jsonl", async () => {
    const serialized = await loadSerializedTranscript("subagent.jsonl");
    expect(serialized).toMatchInlineSnapshot(`
      {
        "blendedTokens": 10896,
        "costUsd": 0.040881600000000004,
        "git": {
          "branch": "main",
          "relativeCwd": ".",
          "repo": "github.com/tailwindlabs/tailwind-studio",
        },
        "id": "609efeca-2f51-4118-b077-e91c9fe63f73",
        "messageCount": 7,
        "messages": [
          {
            "id": "d4051f12-b400-4141-b750-c5a6a0144cf2",
            "text": "ask a subagent how he's doing",
            "timestamp": "2025-10-10T21:54:58.634Z",
            "type": "user",
          },
          {
            "id": "msg_01J9fhCd93KbDV2ck2qE8K4d",
            "model": "claude-sonnet-4-5-20250929",
            "text": 
      "The user is asking me to "ask a subagent how he's doing". This is a bit of an unusual request - they want me to use the Task tool to launch a subagent and essentially just have a casual conversation with it.

      This doesn't really fit any of the specialized agent types described:
      - general-purpose: For researching complex questions, searching for code, and executing multi-step tasks
      - statusline-setup: For configuring status line settings
      - output-style-setup: For creating output styles

      None of these are meant for casual conversation. However, I could use the general-purpose agent and give it a simple task of responding to a greeting or question about how it's doing.

      This seems like a somewhat playful/experimental request from the user. I should just go ahead and do it - launch a general-purpose agent with a simple prompt asking how it's doing."
      ,
            "timestamp": "2025-10-10T21:55:06.403Z",
            "type": "thinking",
          },
          {
            "id": "msg_01J9fhCd93KbDV2ck2qE8K4d",
            "model": "claude-sonnet-4-5-20250929",
            "text": "I'll launch a general-purpose agent and check in on them!",
            "timestamp": "2025-10-10T21:55:06.990Z",
            "type": "agent",
          },
          {
            "id": "msg_01J9fhCd93KbDV2ck2qE8K4d",
            "input": {
              "description": "Check how agent is doing",
              "prompt": 
      "Hey there! Just checking in - how are you doing today? 

      Please respond with how you're doing, and then return your response in your final message back to me. This is just a casual check-in, no coding work needed."
      ,
              "subagent_type": "general-purpose",
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "content": [
                {
                  "text": 
      "Hello! I'm doing well, thank you for asking! I'm ready and available to help you with any work on the Tailwind Studio project whenever you need it.

      Since this is just a casual check-in with no coding tasks required, I'll keep it simple - I'm functioning properly and prepared to assist with development, debugging, architecture questions, or any other needs that come up with your React-based visual design tool.

      How are you doing today? Is there anything you'd like to work on with the project, or just checking in?"
      ,
                  "type": "text",
                },
              ],
              "prompt": 
      "Hey there! Just checking in - how are you doing today? 

      Please respond with how you're doing, and then return your response in your final message back to me. This is just a casual check-in, no coding work needed."
      ,
              "status": "completed",
              "totalDurationMs": 4802,
              "totalTokens": 12526,
              "totalToolUseCount": 0,
              "usage": {
                "cache_creation": {
                  "ephemeral_1h_input_tokens": 0,
                  "ephemeral_5m_input_tokens": 12405,
                },
                "cache_creation_input_tokens": 12405,
                "cache_read_input_tokens": 0,
                "input_tokens": 4,
                "output_tokens": 117,
                "service_tier": "standard",
              },
            },
            "timestamp": "2025-10-10T21:55:09.367Z",
            "toolName": "Task",
            "type": "tool-call",
          },
          {
            "id": "msg_01JkzQ7ZwMMMcKk3EY9X3sG1",
            "model": "claude-sonnet-4-5-20250929",
            "text": 
      "The user asked me to ask a subagent how they're doing, and I did that. The subagent responded politely saying they're doing well and ready to help. Now I should report back to the user with what the subagent said.

      This is just a casual/fun interaction, not a real task that needs a todo list, so I'll just respond normally."
      ,
            "timestamp": "2025-10-10T21:55:19.092Z",
            "type": "thinking",
          },
          {
            "id": "msg_01JkzQ7ZwMMMcKk3EY9X3sG1",
            "model": "claude-sonnet-4-5-20250929",
            "text": 
      "The subagent says they're doing well and ready to help! They mentioned they're functioning properly and prepared to assist with the Tailwind Studio project whenever needed. They even asked how I'm doing and if there's anything to work on. 

      Pretty friendly agent! 😊"
      ,
            "timestamp": "2025-10-10T21:55:20.440Z",
            "type": "agent",
          },
        ],
        "model": "claude-sonnet-4-5-20250929",
        "modelUsage": [
          {
            "model": "claude-sonnet-4-5-20250929",
            "usage": {
              "cachedInputTokens": 20952,
              "inputTokens": 31689,
              "outputTokens": 159,
              "reasoningOutputTokens": 0,
              "totalTokens": 31848,
            },
          },
        ],
        "preview": "ask a subagent how he's doing",
        "source": "claude-code",
        "timestamp": "2025-10-10T21:55:20.440Z",
        "tokenUsage": {
          "cachedInputTokens": 20952,
          "inputTokens": 31689,
          "outputTokens": 159,
          "reasoningOutputTokens": 0,
          "totalTokens": 31848,
        },
        "v": 1,
      }
    `);
  });

  test("todos.jsonl", async () => {
    const serialized = await loadSerializedTranscript("todos.jsonl");
    expect(serialized).toMatchInlineSnapshot(`
      {
        "blendedTokens": 2835,
        "costUsd": 0.04278390000000001,
        "git": {
          "branch": "main",
          "relativeCwd": "fixtures/claudecode",
          "repo": "github.com/vibeinsights/vibeinsights",
        },
        "id": "0db46778-18a1-4d84-853f-d4dc72a07a1b",
        "messageCount": 17,
        "messages": [
          {
            "id": "a47984ff-069f-4c10-890c-d39fafb506c3",
            "text": "create a todo list with 3 items, then check off each step by step then clear it",
            "timestamp": "2025-10-12T21:40:29.471Z",
            "type": "user",
          },
          {
            "id": "msg_01PEHmYb3sgTVwcKVK8zZe9W",
            "model": "claude-sonnet-4-5-20250929",
            "text": "I'll create a todo list with 3 items, check them off step by step, and then clear it.",
            "timestamp": "2025-10-12T21:40:31.961Z",
            "type": "agent",
          },
          {
            "id": "msg_01PEHmYb3sgTVwcKVK8zZe9W",
            "input": {
              "todos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "pending",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "pending",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "pending",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "pending",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "pending",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "pending",
                },
              ],
              "oldTodos": [],
            },
            "timestamp": "2025-10-12T21:40:33.287Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_01Vu4P668SsxMAEwR5XCS1HL",
            "model": "claude-sonnet-4-5-20250929",
            "text": "Now I'll mark the first task as in progress and complete it:",
            "timestamp": "2025-10-12T21:40:35.380Z",
            "type": "agent",
          },
          {
            "id": "msg_01Vu4P668SsxMAEwR5XCS1HL",
            "input": {
              "todos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "pending",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "pending",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "pending",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "pending",
                },
              ],
              "oldTodos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "pending",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "pending",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "pending",
                },
              ],
            },
            "timestamp": "2025-10-12T21:40:36.183Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_019ZRy9Jm6XbTSNxuXh1TKrD",
            "model": "claude-sonnet-4-5-20250929",
            "text": "First task completed! Now marking it as complete and moving to the second task:",
            "timestamp": "2025-10-12T21:40:38.412Z",
            "type": "agent",
          },
          {
            "id": "msg_019ZRy9Jm6XbTSNxuXh1TKrD",
            "input": {
              "todos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "pending",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "pending",
                },
              ],
              "oldTodos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "pending",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "pending",
                },
              ],
            },
            "timestamp": "2025-10-12T21:40:39.199Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_01PKiqSm8xTFuuCnZzES8GXg",
            "model": "claude-sonnet-4-5-20250929",
            "text": "Second task completed! Now marking it as complete and moving to the third task:",
            "timestamp": "2025-10-12T21:40:41.111Z",
            "type": "agent",
          },
          {
            "id": "msg_01PKiqSm8xTFuuCnZzES8GXg",
            "input": {
              "todos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "in_progress",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "in_progress",
                },
              ],
              "oldTodos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "in_progress",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "pending",
                },
              ],
            },
            "timestamp": "2025-10-12T21:40:42.127Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_01KeSAsHmMR8QU3JUWvwDt4i",
            "model": "claude-sonnet-4-5-20250929",
            "text": "Third task completed! Now marking it as complete:",
            "timestamp": "2025-10-12T21:40:44.965Z",
            "type": "agent",
          },
          {
            "id": "msg_01KeSAsHmMR8QU3JUWvwDt4i",
            "input": {
              "todos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "completed",
                },
              ],
            },
            "model": "claude-sonnet-4-5-20250929",
            "output": {
              "newTodos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "completed",
                },
              ],
              "oldTodos": [
                {
                  "activeForm": "Completing first task",
                  "content": "Complete first task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing second task",
                  "content": "Complete second task",
                  "status": "completed",
                },
                {
                  "activeForm": "Completing third task",
                  "content": "Complete third task",
                  "status": "in_progress",
                },
              ],
            },
            "timestamp": "2025-10-12T21:40:45.554Z",
            "toolName": "TodoWrite",
            "type": "tool-call",
          },
          {
            "id": "msg_01RVE2vyejpWb4hWtVSvjdxD",
            "model": "claude-sonnet-4-5-20250929",
            "text": "Done! I've created a todo list with 3 items, checked off each one step by step, and now the list has been automatically cleared since all items are completed.",
            "timestamp": "2025-10-12T21:40:49.323Z",
            "type": "agent",
          },
        ],
        "model": "claude-sonnet-4-5-20250929",
        "modelUsage": [
          {
            "model": "claude-sonnet-4-5-20250929",
            "usage": {
              "cachedInputTokens": 87863,
              "inputTokens": 90038,
              "outputTokens": 660,
              "reasoningOutputTokens": 0,
              "totalTokens": 90698,
            },
          },
        ],
        "preview": "create a todo list with 3 items, then check off each step by step then clear it",
        "source": "claude-code",
        "timestamp": "2025-10-12T21:40:49.323Z",
        "tokenUsage": {
          "cachedInputTokens": 87863,
          "inputTokens": 90038,
          "outputTokens": 660,
          "reasoningOutputTokens": 0,
          "totalTokens": 90698,
        },
        "v": 1,
      }
    `);
  });
});

async function loadSerializedTranscript(fileName: string) {
  const transcript = await convertClaudeCodeFile(path.join(FIXTURE_DIR, fileName), {
    pricing: TEST_PRICING,
    now: TEST_NOW,
  });

  expect(transcript).not.toBeNull();
  return serializeTranscript(transcript!);
}

function serializeTranscript(transcript: UnifiedTranscript) {
  return {
    ...transcript,
    timestamp: transcript.timestamp.toISOString(),
  };
}
