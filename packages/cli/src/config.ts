import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getLocalStore } from "./local-store";

const CONFIG_DIR = join(homedir(), ".config", "agentlogs");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type EnvName = string;

export interface EnvironmentUser {
  id: string;
  email: string;
  name: string;
}

export interface Environment {
  name: EnvName;
  baseURL: string;
  user: EnvironmentUser;
  lastLoginTime: string;
}

interface Config {
  environments: Environment[];
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Read the config file
 */
export function readConfig(): Config {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    return { environments: [] };
  }

  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(content) as Partial<Config>;
    return {
      environments: Array.isArray(parsed.environments) ? parsed.environments : [],
    };
  } catch {
    return { environments: [] };
  }
}

/**
 * Write to the config file
 */
export function writeConfig(config: Config): void {
  ensureConfigDir();

  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write config file:", error);
    throw error;
  }
}

/**
 * Get all configured environments
 */
export function getEnvironments(): Environment[] {
  return readConfig().environments;
}

/**
 * Get a specific environment by name
 */
export function getEnvironment(envName: EnvName): Environment | undefined {
  return getEnvironments().find((env) => env.name === envName);
}

/**
 * Get the local store key for a token
 */
function getTokenKey(envName: EnvName): string {
  return `auth.token.${envName}`;
}

/**
 * Get the access token for a specific environment from the local SQLite store
 */
export async function getTokenForEnv(envName: EnvName): Promise<string | null> {
  // Check for environment variable override
  const envToken = process.env.AGENTLOGS_AUTH_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  try {
    const env = getEnvironment(envName);
    if (!env?.user?.email) {
      return null;
    }

    const store = getLocalStore();
    const token = await store.get<string>(getTokenKey(envName));
    return token ?? null;
  } catch {
    return null;
  }
}

/**
 * Set the access token for a specific environment in the local SQLite store
 */
export async function setTokenForEnv(envName: EnvName, _email: string, token: string): Promise<void> {
  try {
    const store = getLocalStore();
    await store.set(getTokenKey(envName), token);
  } catch (error) {
    console.error("Failed to store token:", error);
    throw error;
  }
}

/**
 * Delete the access token for a specific environment from the local SQLite store
 */
export async function deleteTokenForEnv(envName: EnvName): Promise<void> {
  try {
    const store = getLocalStore();
    await store.delete(getTokenKey(envName));
  } catch {
    // Token doesn't exist or couldn't be deleted - that's okay
  }
}

/**
 * Add or update an environment in the config
 */
export function upsertEnvironment(env: Environment): void {
  const config = readConfig();
  const existingIndex = config.environments.findIndex((e) => e.name === env.name);

  if (existingIndex >= 0) {
    config.environments[existingIndex] = env;
  } else {
    config.environments.push(env);
  }

  writeConfig(config);
}

/**
 * Remove an environment from the config
 */
export function removeEnvironment(envName: EnvName): void {
  const config = readConfig();
  config.environments = config.environments.filter((e) => e.name !== envName);
  writeConfig(config);
}

function getServerNameFromUrl(serverUrl: string): string {
  try {
    return new URL(serverUrl).host.toLowerCase();
  } catch {
    return "custom";
  }
}

/**
 * Get environments with valid auth tokens
 * Returns environments that have both config and a valid local store token
 * Also supports CI mode via AGENTLOGS_AUTH_TOKEN environment variable
 */
export async function getAuthenticatedEnvironments(): Promise<Array<Environment & { token: string }>> {
  const environments = getEnvironments();
  const result: Array<Environment & { token: string }> = [];

  for (const env of environments) {
    const token = await getTokenForEnv(env.name);
    if (token) {
      result.push({ ...env, token });
    }
  }

  // Support CI mode: if AGENTLOGS_AUTH_TOKEN is set but no environments are configured,
  // create a synthetic environment using the token and server URL from env vars
  if (result.length === 0) {
    const envToken = process.env.AGENTLOGS_AUTH_TOKEN?.trim();
    if (envToken) {
      const serverUrl =
        process.env.AGENTLOGS_SERVER_URL?.trim() || process.env.SERVER_URL?.trim() || "https://agentlogs.ai";
      result.push({
        name: getServerNameFromUrl(serverUrl),
        baseURL: serverUrl,
        user: { id: "ci", email: "ci@agentlogs.ai", name: "CI" },
        lastLoginTime: new Date().toISOString(),
        token: envToken,
      });
    }
  }

  return result;
}
