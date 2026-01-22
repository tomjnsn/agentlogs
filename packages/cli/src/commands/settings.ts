import { readSettings, setAllowMode, getSettingsPath, type AllowMode } from "../settings";

export interface SettingsCommandOptions {
  allowMode?: string;
}

export async function settingsCommand(options: SettingsCommandOptions = {}): Promise<void> {
  // If allowMode option is provided, update the setting
  if (options.allowMode) {
    const mode = options.allowMode.toLowerCase();
    if (mode !== "allowlist" && mode !== "denylist") {
      console.error("Invalid allowMode. Use 'allowlist' or 'denylist'.");
      process.exit(1);
    }
    setAllowMode(mode as AllowMode);
    console.log(`Allow mode set to: ${mode}`);
    console.log();
  }

  // Display current settings
  const settings = readSettings();

  console.log("AgentLogs Settings");
  console.log("──────────────────");
  console.log(`Mode:               ${settings.allowMode}`);
  console.log(`Config:             ${getSettingsPath()}`);
  console.log();

  const repoIds = Object.keys(settings.repos);
  if (repoIds.length === 0) {
    console.log("Repos:              (none configured)");
  } else {
    console.log("Repos:");
    for (const repoId of repoIds) {
      const repo = settings.repos[repoId];
      if (repo.allow) {
        const visibility = repo.visibility ?? "(server default)";
        console.log(`  ✓ ${repoId}    ${visibility}`);
      } else {
        console.log(`  ✗ ${repoId}    (denied)`);
      }
    }
  }

  process.exit(0);
}
