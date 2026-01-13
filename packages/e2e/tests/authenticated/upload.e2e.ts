import { test, expect, Page } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "path";
import fs from "fs";
import os from "os";

const ROOT_DIR = path.resolve(import.meta.dirname!, "../../../..");
const TEST_AUTH_TOKEN = "test-session-token";
const SERVER_URL = "http://localhost:3009";

type FixtureCase = {
  cwd: string;
  expectedSnippet: string;
  fixturePath: string;
  uploadCommand: string;
};

interface UploadResult {
  output: string;
  transcriptId: string | null;
}

/**
 * Upload transcript using the CLI.
 * Uses a temp HOME directory to ensure the CLI uses SERVER_URL env var
 * instead of any existing user configuration.
 */
function uploadFixtureTranscript(fixture: FixtureCase): UploadResult {
  // Create a temp HOME directory so CLI doesn't use existing user config
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentlogs-test-"));

  try {
    const output = execSync(`bun agentlogs ${fixture.uploadCommand} upload ${fixture.fixturePath}`, {
      cwd: ROOT_DIR,
      env: {
        // Use temp HOME so CLI doesn't find existing config
        HOME: tempHome,
        PATH: process.env.PATH,
        // These env vars tell the CLI to use our test server
        SERVER_URL,
        AGENTLOGS_AUTH_TOKEN: TEST_AUTH_TOKEN,
      },
      encoding: "utf-8",
      timeout: 60000,
    });

    // Extract transcript ID from output
    const transcriptIdMatch = output.match(/Transcript ID: ([^\s\n]+)/);
    const transcriptId = transcriptIdMatch ? transcriptIdMatch[1] : null;

    return { output, transcriptId };
  } finally {
    // Cleanup temp directory
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

async function assertTranscriptInUi(page: Page, transcriptId: string) {
  // Navigate directly to the transcript detail page
  await page.goto(`/app/logs/${transcriptId}`);

  // Wait for the page to load - verify we're on a valid transcript page
  // by checking for the presence of transcript content
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10000 });
}

test.describe("CLI Upload", () => {
  test("uploads claudecode crud fixture and shows it in the UI", async ({ page }) => {
    const fixture = {
      cwd: "/Users/philipp/dev/vibeinsights/fixtures/claudecode",
      expectedSnippet: "create a file `JOKE.md` with a ranom joke",
      fixturePath: path.join(ROOT_DIR, "fixtures/claudecode/crud.jsonl"),
      uploadCommand: "claudecode",
    } satisfies FixtureCase;
    const result = uploadFixtureTranscript(fixture);
    expect(result.output).toContain("Upload complete");
    expect(result.transcriptId).toBeTruthy();

    await assertTranscriptInUi(page, result.transcriptId!);
  });

  test("uploads claudecode compact fixture and shows it in the UI", async ({ page }) => {
    const fixture = {
      cwd: "/Users/philipp/dev/studio",
      expectedSnippet: "how are you doing",
      fixturePath: path.join(ROOT_DIR, "fixtures/claudecode/compact.jsonl"),
      uploadCommand: "claudecode",
    } satisfies FixtureCase;
    const result = uploadFixtureTranscript(fixture);
    expect(result.output).toContain("Upload complete");
    expect(result.transcriptId).toBeTruthy();

    await assertTranscriptInUi(page, result.transcriptId!);
  });

  test("uploads claudecode images fixture and shows it in the UI", async ({ page }) => {
    const fixture = {
      cwd: "/Users/philipp/dev/vibeinsights",
      expectedSnippet: "go to google.com, make a screenshoot, look at it, and tell me what you think",
      fixturePath: path.join(ROOT_DIR, "fixtures/claudecode/images.jsonl"),
      uploadCommand: "claudecode",
    } satisfies FixtureCase;
    const result = uploadFixtureTranscript(fixture);
    expect(result.output).toContain("Upload complete");
    expect(result.transcriptId).toBeTruthy();

    await assertTranscriptInUi(page, result.transcriptId!);
  });

  test("uploads claudecode subagent fixture and shows it in the UI", async ({ page }) => {
    const fixture = {
      cwd: "/Users/philipp/dev/studio",
      expectedSnippet: "ask a subagent how he's doing",
      fixturePath: path.join(ROOT_DIR, "fixtures/claudecode/subagent.jsonl"),
      uploadCommand: "claudecode",
    } satisfies FixtureCase;
    const result = uploadFixtureTranscript(fixture);
    expect(result.output).toContain("Upload complete");
    expect(result.transcriptId).toBeTruthy();

    await assertTranscriptInUi(page, result.transcriptId!);
  });

  test("uploads claudecode todos fixture and shows it in the UI", async ({ page }) => {
    const fixture = {
      cwd: "/Users/philipp/dev/vibeinsights/fixtures/claudecode",
      expectedSnippet: "create a todo list with 3 items",
      fixturePath: path.join(ROOT_DIR, "fixtures/claudecode/todos.jsonl"),
      uploadCommand: "claudecode",
    } satisfies FixtureCase;
    const result = uploadFixtureTranscript(fixture);
    expect(result.output).toContain("Upload complete");
    expect(result.transcriptId).toBeTruthy();

    await assertTranscriptInUi(page, result.transcriptId!);
  });

  test("uploads codex crud fixture and shows it in the UI", async ({ page }) => {
    const fixture = {
      cwd: "/Users/philipp/dev/vibeinsights/fixtures",
      expectedSnippet: "create a file `JOKE.md` with a random joke",
      fixturePath: path.join(ROOT_DIR, "fixtures/codex/crud.jsonl"),
      uploadCommand: "codex",
    } satisfies FixtureCase;
    const result = uploadFixtureTranscript(fixture);
    expect(result.output).toContain("Upload complete");
    expect(result.transcriptId).toBeTruthy();

    await assertTranscriptInUi(page, result.transcriptId!);
  });
});
