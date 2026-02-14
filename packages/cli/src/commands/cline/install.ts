/**
 * Cline Install Command
 *
 * Sets up agentlogs hooks in Cline's global hooks directory (~/Documents/Cline/Hooks/).
 * Creates hooks for transcript upload (TaskComplete, TaskCancel) and commit tracking (PostToolUse).
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CLINE_HOOKS_DIR = join(homedir(), "Documents", "Cline", "Hooks");

const MARKER = "# agentlogs-managed";

/**
 * All hooks pipe stdin to `agentlogs cline hook` which handles routing internally.
 * The hook runs in the background for TaskComplete/TaskCancel (upload is slow),
 * but inline for PostToolUse (commit tracking is fast and within Cline's 30s timeout).
 */
function hookScript(hookName: string): string {
  if (hookName === "PostToolUse") {
    // Inline — commit tracking is fast, and we need to finish before Cline moves on
    return `#!/usr/bin/env bash
${MARKER}
input=$(cat)
echo "$input" | npx agentlogs cline hook 2>/dev/null
echo '{"cancel": false}'
`;
  }

  // Background — upload is slow, don't block Cline
  return `#!/usr/bin/env bash
${MARKER}
input=$(cat)
echo "$input" | npx agentlogs cline hook &>/dev/null &
echo '{"cancel": false}'
`;
}

const HOOKS: { name: string; description: string }[] = [
  { name: "PostToolUse", description: "Track git commits in agentlogs" },
  { name: "TaskComplete", description: "Upload transcript when a Cline task completes" },
  { name: "TaskCancel", description: "Upload transcript when a Cline task is cancelled" },
];

export async function clineInstallCommand(): Promise<void> {
  console.log("Setting up agentlogs hooks for Cline...");
  console.log(`Hooks directory: ${CLINE_HOOKS_DIR}`);
  console.log("");

  mkdirSync(CLINE_HOOKS_DIR, { recursive: true });

  let installed = 0;
  let skipped = 0;

  for (const hook of HOOKS) {
    const hookPath = join(CLINE_HOOKS_DIR, hook.name);

    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, "utf-8");
      if (existing.includes(MARKER)) {
        writeFileSync(hookPath, hookScript(hook.name), { mode: 0o755 });
        console.log(`  Updated: ${hook.name}`);
        installed++;
      } else {
        console.log(`  Skipped: ${hook.name} (existing hook not managed by agentlogs)`);
        skipped++;
      }
    } else {
      writeFileSync(hookPath, hookScript(hook.name), { mode: 0o755 });
      chmodSync(hookPath, 0o755);
      console.log(`  Created: ${hook.name}`);
      installed++;
    }
  }

  console.log("");
  if (installed > 0) {
    console.log(`Installed ${installed} hook(s).`);
  }
  if (skipped > 0) {
    console.log(`Skipped ${skipped} hook(s) with existing non-agentlogs content.`);
  }
  console.log("");
  console.log("Cline will now auto-upload transcripts and track commits.");
  console.log("Run `agentlogs status` to verify you are logged in.");
}
