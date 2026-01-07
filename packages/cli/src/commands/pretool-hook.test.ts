import { describe, expect, test } from "bun:test";
import {
  appendTranscriptLink,
  containsGitCommit,
  extractCommand,
  getRepoPath,
} from "./pretool-hook";

describe("containsGitCommit", () => {
  test("detects git commit invocations", () => {
    const matches = [
      "git commit -m \"feat: test\"",
      "git    commit -am \"message\"",
      "echo ok && git commit --amend",
    ];

    for (const command of matches) {
      expect(containsGitCommit(command)).toBe(true);
    }
  });

  test("rejects non-commit commands", () => {
    const misses = [
      "git status",
      "git commits -m \"message\"",
      "gitcommit -m \"message\"",
      "commit git -m \"message\"",
    ];

    for (const command of misses) {
      expect(containsGitCommit(command)).toBe(false);
    }
  });
});

describe("appendTranscriptLink", () => {
  const sessionId = "abc123";
  const link = `🔮 View transcript: https://vibeinsights.dev/s/${sessionId}`;

  test("adds link to -m \"message\" commits", () => {
    const command = "git commit -m \"Initial commit\"";
    const expected = `git commit -m "Initial commit\n\n${link}"`;
    expect(appendTranscriptLink(command, sessionId)).toBe(expected);
  });

  test("adds link to -m 'message' commits", () => {
    const command = "git commit -m 'Initial commit'";
    const expected = `git commit -m 'Initial commit\n\n${link}'`;
    expect(appendTranscriptLink(command, sessionId)).toBe(expected);
  });

  test("adds link to --message \"message\" commits", () => {
    const command = "git commit --message \"Initial commit\"";
    const expected = `git commit --message "Initial commit\n\n${link}"`;
    expect(appendTranscriptLink(command, sessionId)).toBe(expected);
  });

  test("returns original command when no message flag is present", () => {
    const command = "git commit --amend";
    expect(appendTranscriptLink(command, sessionId)).toBe(command);
  });

  test("does not double-add when link already exists", () => {
    const command = `git commit -m "Initial commit\n\n${link}"`;
    expect(appendTranscriptLink(command, sessionId)).toBe(command);
  });
});

describe("extractCommand", () => {
  test("extracts command from tool_input and updates it", () => {
    const hookInput = { tool_input: { command: "git status" } };
    const { command, updateCommand } = extractCommand(hookInput);

    expect(command).toBe("git status");
    updateCommand("git commit -m \"hi\"");
    expect(hookInput.tool_input.command).toBe("git commit -m \"hi\"");
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
