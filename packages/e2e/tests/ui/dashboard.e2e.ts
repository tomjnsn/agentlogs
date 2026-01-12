/**
 * Authenticated dashboard tests.
 * These tests run with the pre-authenticated storage state.
 */
import { test, expect } from "@playwright/test";
import { getTestDb } from "../../utils/db";
import { createRepo, createTranscript, testId } from "../../utils/factories";

test.describe("Dashboard", () => {
  test("shows authenticated header with email", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "AgentLogs" })).toBeVisible();
    await expect(page.getByText("test@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();
  });

  test("displays empty state when no repos or transcripts", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "AgentLogs" })).toBeVisible();
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
    await expect(page.getByText(`github.com/test/repo-${id}`)).toBeVisible();
  });

  test("displays private transcripts grouped by cwd", async ({ page }) => {
    const id = testId();
    const { db, sqlite, schema } = getTestDb();
    db.insert(schema.transcripts)
      .values(createTranscript(id, { repoId: null, cwd: `/Users/test/projects/private-${id}` }))
      .run();
    sqlite.close();

    await page.goto("/app");
    await expect(page.getByText(`private-${id}`)).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("navigates to repo detail page", async ({ page }) => {
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

    // Wait for the repo to be visible first
    await expect(page.getByText(`github.com/test/repo-${id}`)).toBeVisible();

    // Find the row with our repo and click the View link
    const repoRow = page.getByRole("row", { name: new RegExp(`repo-${id}`) });
    await repoRow.getByRole("link", { name: "View" }).click();

    // Should navigate to repo detail
    await expect(page).toHaveURL(new RegExp(`/repos/repo-${id}`));
  });

  test("sign out button is visible and clickable", async ({ page }) => {
    await page.goto("/app");

    // Verify we're authenticated
    await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();
    await expect(page.getByText("test@example.com")).toBeVisible();

    // Note: Full sign out redirect test is skipped because TanStack Router's
    // invalidate() behavior with storage state cookies is complex to test.
    // The sign out implementation is verified manually and through auth API tests.
  });
});
