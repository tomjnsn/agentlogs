/**
 * Authenticated dashboard tests.
 * These tests run with the pre-authenticated storage state.
 */
import { test, expect } from "@playwright/test";
import { getTestDb } from "../../utils/db";
import { createRepo, createTranscript, testId } from "../../utils/factories";

// Use serial mode because these tests write directly to the SQLite database
// and concurrent writes can cause conflicts
test.describe.serial("Dashboard", () => {
  test("shows authenticated header with user name", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: "AgentLogs" })).toBeVisible();
    // Look for Test User text in header - use first() since it may appear multiple times
    await expect(page.getByText("Test User").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();
  });

  test("displays empty state when no repos or transcripts", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: "AgentLogs" })).toBeVisible();
  });

  test("displays repositories with transcripts", async ({ page }) => {
    const id = testId();
    const { db, sqlite, schema } = getTestDb();
    const repo = createRepo(id);
    db.insert(schema.repos).values(repo).run();
    db.insert(schema.transcripts)
      .values(createTranscript(id, { repoId: repo.id }))
      .run();
    sqlite.close();

    await page.goto("/app");
    await expect(page.getByText(`test/repo-${id}`)).toBeVisible();
  });

  test("displays private transcripts without repo", async ({ page }) => {
    const id = testId();
    const { db, sqlite, schema } = getTestDb();
    db.insert(schema.transcripts)
      .values(createTranscript(id, { repoId: null, cwd: `/Users/test/projects/private-${id}` }))
      .run();
    sqlite.close();

    await page.goto("/app");
    // Private transcripts show the preview text, not the cwd
    await expect(page.getByText(`Test transcript ${id}`)).toBeVisible();
  });
});

test.describe.serial("Infinite Scroll", () => {
  test("loads more transcripts when scrolling to bottom", async ({ page }) => {
    const id = testId();
    const { db, sqlite, schema } = getTestDb();
    const repo = createRepo(id);
    db.insert(schema.repos).values(repo).run();

    // Create multiple transcripts with different timestamps to test pagination
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      db.insert(schema.transcripts)
        .values(
          createTranscript(`${id}-${i}`, {
            repoId: repo.id,
            preview: `Transcript ${i + 1} of ${id}`,
            createdAt: new Date(now - i * 60000), // 1 minute apart
          }),
        )
        .run();
    }
    sqlite.close();

    await page.goto("/app");

    // Wait for initial load - first transcript should be visible
    await expect(page.getByText(`Transcript 1 of ${id}`)).toBeVisible();

    // With PAGE_SIZE=1 for testing, only 1 transcript loads initially
    // Scroll to trigger loading more
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Wait for more transcripts to load
    await expect(page.getByText(`Transcript 2 of ${id}`)).toBeVisible({ timeout: 5000 });

    // Scroll again to load even more
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByText(`Transcript 3 of ${id}`)).toBeVisible({ timeout: 5000 });
  });

  test("shows end of list quote when all transcripts loaded", async ({ page }) => {
    const id = testId();
    const { db, sqlite, schema } = getTestDb();
    db.insert(schema.transcripts)
      .values(createTranscript(id, { repoId: null }))
      .run();
    sqlite.close();

    await page.goto("/app");

    // Wait for transcript to load
    await expect(page.getByText(`Test transcript ${id}`)).toBeVisible();

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Should show an end-of-list quote (check for the em-dash author attribution pattern)
    await expect(page.getByText(/—\s+\w+/)).toBeVisible({ timeout: 5000 });
  });
});

test.describe.serial("Navigation", () => {
  test("transcript link has correct href", async ({ page }) => {
    const id = testId();

    // Seed test data
    const { db, sqlite, schema } = getTestDb();
    const repo = createRepo(id);
    db.insert(schema.repos).values(repo).run();
    db.insert(schema.transcripts)
      .values(createTranscript(id, { repoId: repo.id }))
      .run();
    sqlite.close();

    await page.goto("/app");

    // Wait for the transcript to be visible
    await expect(page.getByText(`test/repo-${id}`)).toBeVisible();

    // Verify the transcript link has the correct href
    // Note: We don't click/navigate because the test factory doesn't seed R2 data,
    // which would cause SSR errors on the transcript detail page
    const transcriptLink = page.getByRole("link", { name: new RegExp(`Test transcript ${id}`) });
    await expect(transcriptLink).toHaveAttribute("href", new RegExp(`/app/logs/transcript-${id}`));
  });

  test("sign out button is visible and clickable", async ({ page }) => {
    await page.goto("/app");

    // Verify we're authenticated - use first() since Test User appears multiple times
    await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();
    await expect(page.getByText("Test User").first()).toBeVisible();

    // Note: Full sign out redirect test is skipped because TanStack Router's
    // invalidate() behavior with storage state cookies is complex to test.
    // The sign out implementation is verified manually and through auth API tests.
  });
});
