import { resolveServer } from "../auth";
import {
  deleteTokenForEnv,
  getEnvironment,
  getEnvironments,
  removeEnvironment,
  type Environment,
  type EnvName,
} from "../config";

export interface LogoutCommandOptions {
  hostname?: string;
}

export async function logoutCommand(options: LogoutCommandOptions = {}): Promise<void> {
  let targetNames: EnvName[];

  try {
    targetNames = getTargetEnvironmentNames(options.hostname);
  } catch (err) {
    console.error("❌ Error:", err instanceof Error ? err.message : "Invalid hostname");
    process.exit(1);
  }

  if (targetNames.length === 0) {
    if (options.hostname) {
      console.log(`ℹ️  Not currently logged in to ${options.hostname}`);
    } else {
      console.log("ℹ️  Not currently logged in to any environment");
    }
    return;
  }

  const loggedOut: Environment[] = [];

  for (const envName of targetNames) {
    const env = getEnvironment(envName);
    if (!env) {
      continue;
    }

    try {
      await deleteTokenForEnv(envName);
      removeEnvironment(envName);
      loggedOut.push(env);
    } catch (err) {
      console.error(
        `⚠️  Warning: Could not completely clear credentials for ${envName}:`,
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  }

  if (loggedOut.length === 0) {
    console.log("ℹ️  No environments were logged out");
    return;
  }

  if (loggedOut.length === 1) {
    console.log(`✅ Logged out from ${loggedOut[0].name} successfully`);
    console.log(`📧 Was logged in as: ${loggedOut[0].user.email}`);
    return;
  }

  console.log(`✅ Logged out from ${loggedOut.length} environments:`);
  for (const env of loggedOut) {
    console.log(`- ${env.name} (${env.user.email})`);
  }
}

function getTargetEnvironmentNames(hostname?: string): EnvName[] {
  if (hostname) {
    const { host } = resolveServer(hostname);
    const env = getEnvironment(host);
    return env ? [host] : [];
  }

  return getEnvironments().map((env) => env.name);
}
