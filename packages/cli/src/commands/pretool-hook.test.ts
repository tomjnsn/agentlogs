import { describe, expect, test } from "bun:test";
import {
  appendTranscriptLink,
  containsGitCommit,
  extractCommand,
  findLastGitCommitIndex,
  getPromptsSinceLastCommit,
  getRepoPath,
} from "./pretool-hook";

describe("containsGitCommit", () => {
  test("detects git commit invocations", () => {
    const matches = ['git commit -m "feat: test"', 'git    commit -am "message"', "echo ok && git commit --amend"];

    for (const command of matches) {
      expect(containsGitCommit(command)).toBe(true);
    }
  });

  test("rejects non-commit commands", () => {
    const misses = ["git status", 'git commits -m "message"', 'gitcommit -m "message"', 'commit git -m "message"'];

    for (const command of misses) {
      expect(containsGitCommit(command)).toBe(false);
    }
  });
});

describe("appendTranscriptLink", () => {
  const sessionId = "abc123";
  const link = `🔮 View transcript: https://vibeinsights.dev/s/${sessionId}`;

  test('adds link to -m "message" commits', () => {
    const command = 'git commit -m "Initial commit"';
    const expected = `git commit -m "Initial commit\n\n${link}"`;
    expect(appendTranscriptLink(command, sessionId)).toBe(expected);
  });

  test("adds link to -m 'message' commits", () => {
    const command = "git commit -m 'Initial commit'";
    const expected = `git commit -m 'Initial commit\n\n${link}'`;
    expect(appendTranscriptLink(command, sessionId)).toBe(expected);
  });

  test('adds link to --message "message" commits', () => {
    const command = 'git commit --message "Initial commit"';
    const expected = `git commit --message "Initial commit\n\n${link}"`;
    expect(appendTranscriptLink(command, sessionId)).toBe(expected);
  });

  test("returns original command when no message flag is present", () => {
    const command = "git commit --amend";
    expect(appendTranscriptLink(command, sessionId)).toBe(command);
  });

  test("does not double-add when link already exists", () => {
    const command = `git commit -m "Initial commit\n\n${link}"`;
    expect(appendTranscriptLink(command, sessionId, ["New prompt"])).toBe(command);
  });

  test("adds prompts before transcript link", () => {
    const command = 'git commit -m "feat: add auth"';
    const prompts = ["Add login form with email/password", "Fix the TypeScript error"];
    const expected = `git commit -m "feat: add auth\n\nPrompts:\n• "Add login form with email/password"\n• "Fix the TypeScript error"\n\n${link}"`;
    expect(appendTranscriptLink(command, sessionId, prompts)).toBe(expected);
  });

  test("truncates and limits prompt list", () => {
    const command = 'git commit -m "feat: prompts"';
    const longPrompt = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const longerPrompt = `${longPrompt}${longPrompt}`;
    const prompts = [
      "first prompt that should be dropped",
      "second prompt that should be dropped",
      "third prompt that should be included",
      "fourth prompt that should be included",
      "fifth prompt that should be included",
      `sixth prompt ${longPrompt}`,
      `seventh prompt ${longerPrompt}`,
    ];
    const expectedPrompts = [
      "third prompt that should be included",
      "fourth prompt that should be included",
      "fifth prompt that should be included",
      `sixth prompt ${longPrompt}`.slice(0, 57) + "...",
      `seventh prompt ${longerPrompt}`.slice(0, 57) + "...",
    ];
    const expected = `git commit -m "feat: prompts\n\nPrompts:\n${expectedPrompts
      .map((prompt) => `• "${prompt}"`)
      .join("\n")}\n\n${link}"`;
    expect(appendTranscriptLink(command, sessionId, prompts)).toBe(expected);
  });
});

describe("extractCommand", () => {
  test("extracts command from tool_input and updates it", () => {
    const hookInput = { tool_input: { command: "git status" } };
    const { command, updateCommand } = extractCommand(hookInput);

    expect(command).toBe("git status");
    updateCommand('git commit -m "hi"');
    expect(hookInput.tool_input.command).toBe('git commit -m "hi"');
  });

  test("extracts command from top-level command and updates it", () => {
    const hookInput = { command: "ls -la" };
    const { command, updateCommand } = extractCommand(hookInput);

    expect(command).toBe("ls -la");
    updateCommand("pwd");
    expect(hookInput.command).toBe("pwd");
  });

  test("returns undefined when no command exists", () => {
    const hookInput = { tool_input: { args: ["--help"] } };
    const { command, updateCommand } = extractCommand(hookInput);

    expect(command).toBeUndefined();
    expect(() => updateCommand("noop")).not.toThrow();
  });
});

describe("getRepoPath", () => {
  test("prefers repo_path over cwd", () => {
    const hookInput = { repo_path: "/repo/path", cwd: "/other/path" };
    expect(getRepoPath(hookInput)).toBe("/repo/path");
  });

  test("falls back to cwd", () => {
    const hookInput = { cwd: "/repo/path" };
    expect(getRepoPath(hookInput)).toBe("/repo/path");
  });

  test("returns empty string when no path provided", () => {
    const hookInput = {};
    expect(getRepoPath(hookInput)).toBe("");
  });
});

describe("findLastGitCommitIndex", () => {
  test("returns last bash git commit index", () => {
    const entries = [
      { type: "user", text: "first" },
      { type: "tool-call", toolName: "Bash", input: { command: "git status" } },
      { type: "user", text: "second" },
      { type: "tool-call", toolName: "Bash", input: { command: 'git commit -m "feat"' } },
      { type: "user", text: "third" },
      { type: "tool-call", toolName: "Bash", input: { command: ["bash", "-lc", 'git commit -m "fix"'] } },
      { type: "user", text: "fourth" },
    ];

    expect(findLastGitCommitIndex(entries)).toBe(5);
  });

  test("returns -1 when no commit is found", () => {
    const entries = [
      { type: "tool-call", toolName: "Bash", input: { command: "git status" } },
      { type: "user", text: "no commit yet" },
    ];

    expect(findLastGitCommitIndex(entries)).toBe(-1);
  });
});

describe("getPromptsSinceLastCommit", () => {
  test("returns prompts after last commit", () => {
    const entries = [
      { type: "user", text: "first" },
      { type: "tool-call", toolName: "Bash", input: { command: "git status" } },
      { type: "user", text: "second" },
      { type: "tool-call", toolName: "Bash", input: { command: 'git commit -m "feat"' } },
      { type: "user", text: "third" },
      { type: "tool-call", toolName: "Bash", input: { command: 'git commit -m "fix"' } },
      { type: "user", text: "fourth" },
    ];

    expect(getPromptsSinceLastCommit(entries)).toEqual(["fourth"]);
  });

  test("returns all prompts when no commit exists", () => {
    const entries = [
      { type: "user", text: "first" },
      { type: "tool-call", toolName: "Bash", input: { command: "git status" } },
      { type: "user", text: "second" },
    ];

    expect(getPromptsSinceLastCommit(entries)).toEqual(["first", "second"]);
  });
});
