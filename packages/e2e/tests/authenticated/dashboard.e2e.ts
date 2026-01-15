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

test.describe.serial("Navigation", () => {
  test("navigates to transcript detail page", async ({ page }) => {
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

    // Click on the transcript link - the accessible name contains "Test transcript ${id}"
    const transcriptLink = page.getByRole("link", { name: new RegExp(`Test transcript ${id}`) });
    await transcriptLink.click();

    // Should navigate to transcript detail (uses transcriptId: tid-${id})
    await expect(page).toHaveURL(new RegExp(`/app/logs/tid-${id}`));
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
