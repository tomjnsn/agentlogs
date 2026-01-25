import { homedir } from "os";
import { join } from "path";

// Base directory for agentlogs data
export const AGENTLOGS_DIR = join(homedir(), ".agentlogs");

// Service files
export const SERVICE_PID_FILE = join(AGENTLOGS_DIR, "service.pid");
export const SERVICE_SOCKET_PATH = join(AGENTLOGS_DIR, "service.sock");
export const SERVICE_LOG_FILE = join(AGENTLOGS_DIR, "service.log");

// Codex directories
export const CODEX_DIR = join(homedir(), ".codex");
export const CODEX_SESSIONS_DIR = join(CODEX_DIR, "sessions");

// Watcher log (temporary, for debugging)
export const WATCHER_LOG_FILE = join(AGENTLOGS_DIR, "watcher-events.log");
