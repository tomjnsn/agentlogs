import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";

const ROOT_DIR = path.resolve(import.meta.dirname!, "../../../..");

function runCli(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`bun agentlogs ${args}`, {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() ?? "",
      exitCode: error.status ?? 1,
    };
  }
}

test.describe("CLI Smoke Tests", () => {
  test("CLI runs and shows help", async () => {
    const result = runCli("--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agentlogs");
  });
});
