import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Entry } from "@napi-rs/keyring";

const CONFIG_DIR = join(homedir(), ".config", "vibeinsights");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const KEYRING_SERVICE = "vibeinsights-cli";

interface Config {
  baseURL?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  lastLoginTime?: string;
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
    return {};
  }

  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to read config file:", error);
    return {};
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
 * Get the access token from the OS keychain
 */
export function getToken(): string | null {
  try {
    const config = readConfig();
    if (!config.user?.email) {
      return null;
    }

    const entry = new Entry(KEYRING_SERVICE, config.user.email);
    const token = entry.getPassword();
    return token;
  } catch (error) {
    // Token doesn't exist or couldn't be retrieved
    return null;
  }
}

/**
 * Set the access token in the OS keychain
 */
export function setToken(account: string, token: string): void {
  try {
    const entry = new Entry(KEYRING_SERVICE, account);
    entry.setPassword(token);
  } catch (error) {
    console.error("Failed to store token in keychain:", error);
    throw error;
  }
}

/**
 * Delete the access token from the OS keychain
 */
export function deleteToken(): void {
  try {
    const config = readConfig();
    if (!config.user?.email) {
      return;
    }

    const entry = new Entry(KEYRING_SERVICE, config.user.email);
    entry.deletePassword();
  } catch (error) {
    // Token doesn't exist or couldn't be deleted - that's okay
  }
}
