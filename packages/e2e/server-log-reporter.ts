import type { Reporter, FullResult } from "@playwright/test/reporter";
import fs from "fs";
import path from "path";

const SERVER_LOG_FILE = path.join(import.meta.dirname!, ".server-output.log");

/**
 * Custom reporter that prints server logs when tests fail.
 * Use alongside other reporters like "dot".
 */
export default class ServerLogReporter implements Reporter {
  onEnd(result: FullResult) {
    if (result.status === "failed" && fs.existsSync(SERVER_LOG_FILE)) {
      const logs = fs.readFileSync(SERVER_LOG_FILE, "utf-8");
      if (logs.trim()) {
        console.log("\n\x1b[33m─── Server logs ───\x1b[0m");
        console.log(logs);
        console.log("\x1b[33m───────────────────\x1b[0m\n");
      }
    }

    // Clean up log file
    if (fs.existsSync(SERVER_LOG_FILE)) {
      fs.unlinkSync(SERVER_LOG_FILE);
    }
  }
}
