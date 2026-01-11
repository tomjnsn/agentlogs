import { describe, expect, it } from "bun:test";
import { appendTranscriptLink, containsGitCommit } from "./hook";

describe("containsGitCommit", () => {
  it("detects git commit command", () => {
    expect(containsGitCommit('git commit -m "message"')).toBe(true);
    expect(containsGitCommit("git commit -am 'message'")).toBe(true);
    expect(containsGitCommit('git commit --message="message"')).toBe(true);
  });

  it("does not match non-commit commands", () => {
    expect(containsGitCommit("git status")).toBe(false);
    expect(containsGitCommit("git push")).toBe(false);
    expect(containsGitCommit("echo git commit")).toBe(true); // substring match is intentional
  });
});

describe("appendTranscriptLink", () => {
  const sessionId = "test-session-123";
  const expectedLink = `🔮 View transcript: https://agentlogs.ai/s/${sessionId}`;

  describe("git commit -m with double quotes", () => {
    it("appends link to message", () => {
      const command = 'git commit -m "initial commit"';
      const result = appendTranscriptLink(command, sessionId);

      expect(result).toContain(expectedLink);
      expect(result).toMatch(/git commit -m "initial commit\n\n.*🔮 View transcript/);
    });
  });

  describe("git commit -m with single quotes", () => {
    it("appends link to message", () => {
      const command = "git commit -m 'initial commit'";
      const result = appendTranscriptLink(command, sessionId);

      expect(result).toContain(expectedLink);
      expect(result).toMatch(/git commit -m 'initial commit\n\n.*🔮 View transcript/);
    });
  });

  describe("git commit --message= with equals sign", () => {
    it('handles --message="msg" format', () => {
      const command = 'git commit --message="fix: something"';
      const result = appendTranscriptLink(command, sessionId);

      expect(result).toContain(expectedLink);
      expect(result).toMatch(/git commit --message="fix: something\n\n.*🔮 View transcript/);
    });

    it("handles --message='msg' format with single quotes", () => {
      const command = "git commit --message='fix: something'";
      const result = appendTranscriptLink(command, sessionId);

      expect(result).toContain(expectedLink);
      expect(result).toMatch(/git commit --message='fix: something\n\n.*🔮 View transcript/);
    });
  });

  describe("git commit -am (add + message)", () => {
    it("appends link to -am message", () => {
      const command = 'git commit -am "quick fix"';
      const result = appendTranscriptLink(command, sessionId);

      expect(result).toContain(expectedLink);
      expect(result).toMatch(/git commit -am "quick fix\n\n.*🔮 View transcript/);
    });
  });

  describe("command without git commit", () => {
    it("returns command unchanged", () => {
      const command = "git push origin main";
      const result = appendTranscriptLink(command, sessionId);

      expect(result).toBe(command);
      expect(result).not.toContain(expectedLink);
    });

    it("returns non-git command unchanged", () => {
      const command = "npm install";
      const result = appendTranscriptLink(command, sessionId);

      expect(result).toBe(command);
    });
  });

  describe("idempotency", () => {
    it("does not add link twice", () => {
      const command = 'git commit -m "initial commit"';
      const firstPass = appendTranscriptLink(command, sessionId);
      const secondPass = appendTranscriptLink(firstPass, sessionId);

      expect(secondPass).toBe(firstPass);

      // Count occurrences of the link
      const linkOccurrences = (secondPass.match(/🔮 View transcript/g) ?? []).length;
      expect(linkOccurrences).toBe(1);
    });
  });

  describe("multiple -m flags", () => {
    it("only appends to the first -m flag", () => {
      const command = 'git commit -m "title" -m "body paragraph"';
      const result = appendTranscriptLink(command, sessionId);

      expect(result).toContain(expectedLink);
      // The link should be inside the first message, leaving second -m intact
      expect(result).toMatch(/-m "title\n\n.*🔮 View transcript.*" -m "body paragraph"/s);
    });
  });
});
