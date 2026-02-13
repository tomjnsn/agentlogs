/**
 * Cline Install Command
 *
 * Sets up agentlogs hooks in Cline's global hooks directory (~/ Documents/Cline/Hooks/).
 * Creates TaskComplete and TaskCancel hook scripts that auto-upload transcripts.
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CLINE_HOOKS_DIR = join(homedir(), "Documents", "Cline", "Hooks");

const MARKER = "# agentlogs-managed";

function hookScript(_hookName: string): string {
  return `#!/usr/bin/env bash
${MARKER}
input=$(cat)
task_id=$(echo "$input" | jq -r '.taskId // empty')
if [[ -n "$task_id" ]]; then
  npx agentlogs cline upload "$task_id" &>/dev/null &
fi
echo '{"cancel": false}'
`;
}

const HOOKS: { name: string; description: string }[] = [
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
        // Overwrite our own hooks (update to latest version)
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
  console.log("Cline will now auto-upload transcripts to agentlogs on task completion.");
  console.log("Run `agentlogs status` to verify you are logged in.");
}
