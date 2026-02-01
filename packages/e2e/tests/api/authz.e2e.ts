import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

const WAITLIST_TOKEN = "waitlist-session-token";
const OTHER_USER_TOKEN = "other-session-token";
const SEEDED_TRANSCRIPT_ID = "seed-transcript-id";

function buildUnifiedTranscript() {
  return {
    v: 1,
    id: "waitlist-ingest-test",
    source: "claude-code" as const,
    timestamp: new Date().toISOString(),
    preview: "hello",
    summary: null,
    model: null,
    clientVersion: null,
    blendedTokens: 0,
    costUsd: 0,
    messageCount: 1,
    toolCount: 0,
    userMessageCount: 1,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    linesModified: 0,
    tokenUsage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    },
    modelUsage: [],
    git: null,
    cwd: null,
    messages: [
      {
        type: "user" as const,
        text: "hello",
      },
    ],
  };
}

test.describe("AuthZ enforcement", () => {
  test("waitlist session cannot ingest transcripts", async ({ request }) => {
    const unifiedTranscript = buildUnifiedTranscript();
    const unifiedJson = JSON.stringify(unifiedTranscript);
    const sha256 = createHash("sha256").update(unifiedJson).digest("hex");

    const response = await request.post("/api/ingest", {
      headers: {
        Authorization: `Bearer ${WAITLIST_TOKEN}`,
      },
      multipart: {
        sha256,
        unifiedTranscript: unifiedJson,
        transcript: JSON.stringify({ event: "test" }),
      },
    });

    expect(response.status()).toBe(403);
  });

  test("waitlist session cannot access admin endpoints", async ({ request }) => {
    const response = await request.get(`/api/admin/transcript-unified/${SEEDED_TRANSCRIPT_ID}`, {
      headers: {
        Authorization: `Bearer ${WAITLIST_TOKEN}`,
      },
    });

    expect(response.status()).toBe(403);
  });

  test("non-owner cannot track commits for another user's transcript", async ({ request }) => {
    const response = await request.post("/api/commit-track", {
      headers: {
        Authorization: `Bearer ${OTHER_USER_TOKEN}`,
      },
      data: {
        transcript_id: SEEDED_TRANSCRIPT_ID,
        repo_path: "/tmp/repo",
        timestamp: new Date().toISOString(),
        commit_sha: "deadbeef",
        commit_title: "Test commit",
        branch: "main",
      },
    });

    expect(response.status()).toBe(403);
  });
});
