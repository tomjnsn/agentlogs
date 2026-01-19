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
  /** The database ID (CUID2) from the upload response */
  id: string | null;
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
    return uploadWithHome(fixture, tempHome);
  } finally {
    // Cleanup temp directory
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

/**
 * Upload transcript with a specific HOME directory.
 * This allows testing ID persistence across uploads.
 */
function uploadWithHome(fixture: FixtureCase, homeDir: string): UploadResult {
  const output = execSync(`bun --silent agentlogs ${fixture.uploadCommand} upload ${fixture.fixturePath}`, {
    cwd: ROOT_DIR,
    env: {
      // Use specified HOME so CLI uses its local.db for ID storage
      HOME: homeDir,
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

  // Extract database ID from output (if present)
  const idMatch = output.match(/ID: ([a-z0-9]{10})/);
  const id = idMatch ? idMatch[1] : null;

  return { output, transcriptId, id };
}

async function assertTranscriptInUi(page: Page, id: string) {
  // Navigate via the /s/ redirect route which looks up by database ID
  // and redirects to the correct /app/logs/{id} URL
  await page.goto(`/s/${id}`);

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
    expect(result.id).toBeTruthy();

    await assertTranscriptInUi(page, result.id!);
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
    expect(result.id).toBeTruthy();

    await assertTranscriptInUi(page, result.id!);
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
    expect(result.id).toBeTruthy();

    await assertTranscriptInUi(page, result.id!);
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
    expect(result.id).toBeTruthy();

    await assertTranscriptInUi(page, result.id!);
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
    expect(result.id).toBeTruthy();

    await assertTranscriptInUi(page, result.id!);
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
    expect(result.id).toBeTruthy();

    await assertTranscriptInUi(page, result.id!);
  });
});

test.describe("Client-Generated ID Behavior", () => {
  const fixture = {
    cwd: "/Users/philipp/dev/vibeinsights/fixtures/claudecode",
    expectedSnippet: "create a file",
    fixturePath: path.join(ROOT_DIR, "fixtures/claudecode/crud.jsonl"),
    uploadCommand: "claudecode",
  } satisfies FixtureCase;

  test("re-uploading same transcript uses same ID (idempotency)", async () => {
    // Create a persistent HOME directory for this test
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentlogs-idempotency-"));

    try {
      // Upload fixture once
      const result1 = uploadWithHome(fixture, tempHome);
      expect(result1.output).toContain("Upload complete");
      expect(result1.id).toBeTruthy();

      // Upload same fixture again with same HOME dir (same local.db)
      const result2 = uploadWithHome(fixture, tempHome);
      expect(result2.output).toContain("Upload complete");
      expect(result2.id).toBeTruthy();

      // Same ID should be returned
      expect(result2.id).toBe(result1.id);
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("server returns existing ID when local DB is missing", async () => {
    // Create two separate HOME directories
    const tempHome1 = fs.mkdtempSync(path.join(os.tmpdir(), "agentlogs-home1-"));
    const tempHome2 = fs.mkdtempSync(path.join(os.tmpdir(), "agentlogs-home2-"));

    try {
      // Upload with HOME1
      const result1 = uploadWithHome(fixture, tempHome1);
      expect(result1.output).toContain("Upload complete");
      expect(result1.id).toBeTruthy();

      // Upload same transcript with HOME2 (different local.db)
      const result2 = uploadWithHome(fixture, tempHome2);
      expect(result2.output).toContain("Upload complete");
      expect(result2.id).toBeTruthy();

      // Server should return the existing ID for this transcriptId
      expect(result2.id).toBe(result1.id);
    } finally {
      fs.rmSync(tempHome1, { recursive: true, force: true });
      fs.rmSync(tempHome2, { recursive: true, force: true });
    }
  });

  test("client-generated ID works directly in /s/ route", async ({ page }) => {
    const result = uploadFixtureTranscript(fixture);
    expect(result.output).toContain("Upload complete");
    expect(result.id).toBeTruthy();

    // Navigate using the client-generated ID directly
    await page.goto(`/s/${result.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10000 });
  });
});
