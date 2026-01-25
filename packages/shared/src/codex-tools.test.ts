import { describe, expect, test } from "bun:test";
import { convertCodexTranscript } from "./codex";

const BASE_TIME = "2025-10-17T21:00:00.000Z";
const CWD = "/Users/philipp/dev/vibeinsights/fixtures";

function buildBaseEvents() {
  return [
    {
      type: "session_meta",
      timestamp: BASE_TIME,
      payload: {
        id: "test-session",
        cwd: CWD,
        git: {
          branch: "main",
          repository_url: "git@github.com:vibeinsights/vibeinsights.git",
        },
      },
    },
    {
      type: "turn_context",
      timestamp: BASE_TIME,
      payload: {
        cwd: CWD,
        model: "gpt-5-codex",
      },
    },
    {
      type: "response_item",
      timestamp: BASE_TIME,
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Do the thing.",
          },
        ],
      },
    },
  ];
}

describe("Codex tool calls", () => {
  test("shell function call", () => {
    const events = [
      ...buildBaseEvents(),
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:10.000Z",
        payload: {
          type: "function_call",
          name: "shell",
          call_id: "call-shell",
          arguments: JSON.stringify({
            command: ["bash", "-lc", "pwd"],
            workdir: CWD,
          }),
        },
      },
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:10.500Z",
        payload: {
          type: "function_call_output",
          call_id: "call-shell",
          output: JSON.stringify({
            output: `${CWD}\n`,
            metadata: {
              exit_code: 0,
              duration_seconds: 0.12,
            },
          }),
        },
      },
    ];

    const transcript = convertCodexTranscript(events);
    expect(transcript).not.toBeNull();
    const toolCall = transcript!.transcript.messages.find((m) => m.type === "tool-call" && m.id === "call-shell");
    expect(toolCall).toMatchInlineSnapshot(`
      {
        "id": "call-shell",
        "input": {
          "command": "pwd",
        },
        "model": "gpt-5-codex",
        "output": {
          "durationSeconds": 0.12,
          "exitCode": 0,
          "stdout": ".",
        },
        "timestamp": "2025-10-17T21:00:10.000Z",
        "toolName": "Bash",
        "type": "tool-call",
      }
    `);
  });

  test("apply_patch custom tool call", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: src/example.txt",
      "@@",
      "-old line",
      "+new line",
      "*** End Patch",
    ].join("\n");

    const events = [
      ...buildBaseEvents(),
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:20.000Z",
        payload: {
          type: "custom_tool_call",
          name: "apply_patch",
          call_id: "call-patch",
          input: patch,
        },
      },
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:20.500Z",
        payload: {
          type: "custom_tool_call_output",
          call_id: "call-patch",
          output: JSON.stringify({
            output: "Success. Updated the following files:\\nM src/example.txt\\n",
            metadata: {
              exit_code: 0,
            },
          }),
        },
      },
    ];

    const transcript = convertCodexTranscript(events);
    expect(transcript).not.toBeNull();
    const toolCall = transcript!.transcript.messages.find((m) => m.type === "tool-call" && m.id === "call-patch");
    expect(toolCall).toMatchInlineSnapshot(`
{
  "id": "call-patch",
  "input": {
    "diff": 
"@@
-old line
+new line
"
,
    "file_path": "./src/example.txt",
  },
  "model": "gpt-5-codex",
  "output": {
    "exitCode": 0,
    "message": "Success. Updated the following files:\\nM src/example.txt\\n",
  },
  "timestamp": "2025-10-17T21:00:20.000Z",
  "toolName": "Edit",
  "type": "tool-call",
}
`);
  });

  test("bash heredoc write converted to Write tool", () => {
    const fileContent = "# Hello World\n\nThis is a test file.\n";
    const events = [
      ...buildBaseEvents(),
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:30.000Z",
        payload: {
          type: "function_call",
          name: "shell",
          call_id: "call-write",
          arguments: JSON.stringify({
            command: ["bash", "-lc", `cat <<'EOF' > test.md\n${fileContent}EOF`],
            workdir: CWD,
          }),
        },
      },
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:30.500Z",
        payload: {
          type: "function_call_output",
          call_id: "call-write",
          output: JSON.stringify({
            output: "",
            metadata: {
              exit_code: 0,
            },
          }),
        },
      },
    ];

    const transcript = convertCodexTranscript(events);
    expect(transcript).not.toBeNull();
    const toolCall = transcript!.transcript.messages.find((m) => m.type === "tool-call" && m.id === "call-write");
    expect(toolCall).toMatchInlineSnapshot(`
      {
        "id": "call-write",
        "input": {
          "content": 
      "# Hello World

      This is a test file.
      "
      ,
          "file_path": "./test.md",
        },
        "model": "gpt-5-codex",
        "output": undefined,
        "timestamp": "2025-10-17T21:00:30.000Z",
        "toolName": "Write",
        "type": "tool-call",
      }
    `);
  });

  test("bash cat read converted to Read tool", () => {
    const fileContent = "# Hello World\n\nThis is a test file.\n";
    const events = [
      ...buildBaseEvents(),
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:40.000Z",
        payload: {
          type: "function_call",
          name: "shell",
          call_id: "call-read",
          arguments: JSON.stringify({
            command: ["bash", "-lc", "cat test.md"],
            workdir: CWD,
          }),
        },
      },
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:40.500Z",
        payload: {
          type: "function_call_output",
          call_id: "call-read",
          output: JSON.stringify({
            output: fileContent,
            metadata: {
              exit_code: 0,
            },
          }),
        },
      },
    ];

    const transcript = convertCodexTranscript(events);
    expect(transcript).not.toBeNull();
    const toolCall = transcript!.transcript.messages.find((m) => m.type === "tool-call" && m.id === "call-read");
    expect(toolCall).toMatchInlineSnapshot(`
      {
        "id": "call-read",
        "input": {
          "file_path": "./test.md",
        },
        "model": "gpt-5-codex",
        "output": 
      "# Hello World

      This is a test file."
      ,
        "timestamp": "2025-10-17T21:00:40.000Z",
        "toolName": "Read",
        "type": "tool-call",
      }
    `);
  });

  test("zsh cat read converted to Read tool", () => {
    const fileContent = "# Hello World\n\nThis is a test file.\n";
    const events = [
      ...buildBaseEvents(),
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:50.000Z",
        payload: {
          type: "function_call",
          name: "shell",
          call_id: "call-zsh-read",
          arguments: JSON.stringify({
            command: ["zsh", "-lc", "cat test.md"],
            workdir: CWD,
          }),
        },
      },
      {
        type: "response_item",
        timestamp: "2025-10-17T21:00:50.500Z",
        payload: {
          type: "function_call_output",
          call_id: "call-zsh-read",
          output: JSON.stringify({
            output: fileContent,
            metadata: {
              exit_code: 0,
            },
          }),
        },
      },
    ];

    const transcript = convertCodexTranscript(events);
    expect(transcript).not.toBeNull();
    const toolCall = transcript!.transcript.messages.find((m) => m.type === "tool-call" && m.id === "call-zsh-read");
    expect(toolCall).toMatchInlineSnapshot(`
      {
        "id": "call-zsh-read",
        "input": {
          "file_path": "./test.md",
        },
        "model": "gpt-5-codex",
        "output": 
      "# Hello World

      This is a test file."
      ,
        "timestamp": "2025-10-17T21:00:50.000Z",
        "toolName": "Read",
        "type": "tool-call",
      }
    `);
  });
});
