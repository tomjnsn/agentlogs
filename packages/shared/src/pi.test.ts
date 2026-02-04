import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { convertPiTranscript, type PiSessionEntry, type PiSessionHeader } from "./pi";

const FIXTURES_DIR = join(__dirname, "../../../fixtures/pi");

function loadFixture(name: string): { header: PiSessionHeader; entries: PiSessionEntry[] } {
  const content = readFileSync(join(FIXTURES_DIR, name), "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const header = JSON.parse(lines[0]) as PiSessionHeader;
  const entries: PiSessionEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    entries.push(JSON.parse(lines[i]) as PiSessionEntry);
  }
  return { header, entries };
}

describe("convertPiTranscript", () => {
  describe("crud fixture", () => {
    it("should convert basic CRUD session", () => {
      const session = loadFixture("crud.jsonl");
      const result = convertPiTranscript(session);

      expect(result).not.toBeNull();
      expect(result!.transcript.source).toBe("pi");
      expect(result!.transcript.id).toBe(session.header.id);

      // Should have user message, thinking, tool calls, and agent response
      const messages = result!.transcript.messages;
      expect(messages.length).toBeGreaterThan(0);

      // First message should be user
      expect(messages[0].type).toBe("user");
      const firstMsg = messages[0] as { type: "user"; text: string };
      expect(firstMsg.text).toContain("JOKE.md");
    });

    it("should extract tool calls correctly", () => {
      const session = loadFixture("crud.jsonl");
      const result = convertPiTranscript(session);

      const toolCalls = result!.transcript.messages.filter((m) => m.type === "tool-call");
      expect(toolCalls.length).toBe(4); // write, read, edit, bash

      const toolNames = toolCalls.map((t) => (t as { toolName: string }).toolName);
      expect(toolNames).toContain("Write");
      expect(toolNames).toContain("Read");
      expect(toolNames).toContain("Edit");
      expect(toolNames).toContain("Bash");
    });

    it("should extract thinking blocks", () => {
      const session = loadFixture("crud.jsonl");
      const result = convertPiTranscript(session);

      const thinking = result!.transcript.messages.filter((m) => m.type === "thinking");
      expect(thinking.length).toBeGreaterThan(0);
    });

    it("should aggregate token usage", () => {
      const session = loadFixture("crud.jsonl");
      const result = convertPiTranscript(session);

      expect(result!.transcript.tokenUsage.inputTokens).toBeGreaterThan(0);
      expect(result!.transcript.tokenUsage.outputTokens).toBeGreaterThan(0);
    });

    it("should calculate stats", () => {
      const session = loadFixture("crud.jsonl");
      const result = convertPiTranscript(session);

      expect(result!.transcript.toolCount).toBe(4);
      expect(result!.transcript.userMessageCount).toBe(1);
    });
  });

  describe("branched fixture", () => {
    it("should convert branched session", () => {
      const session = loadFixture("branched.jsonl");
      const result = convertPiTranscript(session);

      expect(result).not.toBeNull();
      expect(result!.transcript.source).toBe("pi");
    });

    it("should have branch anchor in transcript ID for branched session", () => {
      const session = loadFixture("branched.jsonl");
      const result = convertPiTranscript(session);

      // The branched session should have a composite ID with branch anchor
      // Format: sessionId-branchAnchorId
      expect(result!.transcript.id).toContain("-");
      expect(result!.transcript.id).toContain(session.header.id);
    });

    it("should only include messages from current branch", () => {
      const session = loadFixture("branched.jsonl");
      const result = convertPiTranscript(session);

      // The current branch ends with the limerick, not the second haiku
      const userMessages = result!.transcript.messages.filter((m) => m.type === "user");
      const userTexts = userMessages.map((m) => m.text);

      // Should have "write a haiku" and "instead write a limerick"
      expect(userTexts.some((t) => t?.includes("haiku"))).toBe(true);
      expect(userTexts.some((t) => t?.includes("limerick"))).toBe(true);

      // Should NOT have "second haiku" since that's on the other branch
      expect(userTexts.some((t) => t?.includes("second haiku"))).toBe(false);
    });
  });

  describe("getBranchAnchorId", () => {
    it("should return null for linear session", () => {
      const session = loadFixture("crud.jsonl");
      const result = convertPiTranscript(session);

      // Linear session should have simple ID (no branch anchor suffix)
      expect(result!.transcript.id).toBe(session.header.id);
    });

    it("should return anchor ID for branched session", () => {
      const session = loadFixture("branched.jsonl");
      const result = convertPiTranscript(session);

      // Branched session should have composite ID
      const parts = result!.transcript.id.split("-");
      expect(parts.length).toBeGreaterThan(5); // UUID has 5 parts, plus anchor
    });
  });
});
