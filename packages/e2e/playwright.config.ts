import { defineConfig, devices } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(import.meta.dirname!, ".auth/user.json");

export default defineConfig({
  testDir: "./tests",
  testMatch: /\.e2e\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["dot"], ["./server-log-reporter.ts"]],

  use: {
    baseURL: "http://localhost:3009",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Setup project - creates auth storage state
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Unauthenticated tests
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /authenticated/,
    },
    // Authenticated tests - depend on setup
    {
      name: "chromium-authenticated",
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
      },
      testMatch: /authenticated/,
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "bun run start-test-server.ts",
    url: "http://localhost:3009",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
  },
});
