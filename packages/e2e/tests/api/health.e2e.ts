import { test, expect } from "@playwright/test";

test.describe("API Health", () => {
  test("server is running and returns HTML", async ({ request }) => {
    const response = await request.get("/");
    expect(response.ok()).toBe(true);
    const text = await response.text();
    expect(text).toContain("AgentLogs");
  });

  test("static assets are served", async ({ request }) => {
    // The landing page should load successfully
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
  });
});
