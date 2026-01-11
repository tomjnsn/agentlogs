import { unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { deleteToken, readConfig } from "../config";

export function logoutCommand(): void {
  const config = readConfig();

  if (!config.user) {
    console.log("ℹ️  Not currently logged in");
    return;
  }

  try {
    // Delete token from keyring
    deleteToken();

    // Delete config file
    const configFile = join(homedir(), ".config", "agentlogs", "config.json");
    unlinkSync(configFile);

    console.log("✅ Logged out successfully");
  } catch (err) {
    console.error(
      "⚠️  Warning: Could not completely clear credentials:",
      err instanceof Error ? err.message : "Unknown error",
    );
    console.log("You may need to manually delete ~/.config/agentlogs/config.json");
  }
}
