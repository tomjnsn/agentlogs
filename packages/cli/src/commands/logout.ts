import { deleteTokenForEnv, getEnvironment, removeEnvironment, type EnvName } from "../config";

export interface LogoutCommandOptions {
  dev?: boolean;
}

export async function logoutCommand(options: LogoutCommandOptions = {}): Promise<void> {
  const isDev = options.dev ?? false;
  const envName: EnvName = isDev ? "dev" : "prod";

  const env = getEnvironment(envName);

  if (!env) {
    const envLabel = isDev ? "development" : "production";
    console.log(`ℹ️  Not currently logged in to ${envLabel}`);
    return;
  }

  try {
    // Delete token from local store
    await deleteTokenForEnv(envName);

    // Remove environment from config
    removeEnvironment(envName);

    const envLabel = isDev ? "development" : "production";
    console.log(`✅ Logged out from ${envLabel} successfully`);
    console.log(`📧 Was logged in as: ${env.user.email}`);
  } catch (err) {
    console.error(
      "⚠️  Warning: Could not completely clear credentials:",
      err instanceof Error ? err.message : "Unknown error",
    );
  }
}
