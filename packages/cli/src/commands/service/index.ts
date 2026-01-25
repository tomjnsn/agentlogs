/**
 * Service management commands
 *
 * agentlogs service start  - Start the service (if not running)
 * agentlogs service stop   - Stop the service
 * agentlogs service status - Show service status
 * agentlogs service logs   - Tail the watcher logs
 */

import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { createInterface } from "readline";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { SERVICE_PID_FILE, SERVICE_LOG_FILE, WATCHER_LOG_FILE } from "../../service/paths";
import { connectToService, sendMessage, waitForResponse, type StatusResponse } from "../../service/ipc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Check if service is running by checking PID file and process
 */
function isServiceRunning(): { running: boolean; pid?: number } {
  if (!existsSync(SERVICE_PID_FILE)) {
    return { running: false };
  }

  try {
    const pid = parseInt(readFileSync(SERVICE_PID_FILE, "utf-8").trim());

    // Check if process is alive (signal 0 just checks)
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    // Process is dead or PID file is stale
    return { running: false };
  }
}

/**
 * Start the service as a detached process
 */
export async function startService(): Promise<void> {
  const status = isServiceRunning();

  if (status.running) {
    console.log(`Service already running (PID: ${status.pid})`);
    return;
  }

  // Path to the service server script
  // In development, run via bun directly
  // In production (npx), it would be in dist/
  const serverPath = resolve(__dirname, "../../service/server.ts");
  const serverDistPath = resolve(__dirname, "../../service/server.js");

  const scriptPath = existsSync(serverPath) ? serverPath : serverDistPath;

  if (!existsSync(scriptPath)) {
    console.error(`Service script not found at ${scriptPath}`);
    process.exit(1);
  }

  // Spawn detached process
  const child = spawn("bun", ["run", scriptPath], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });

  child.unref();

  console.log(`Service starting (PID: ${child.pid})...`);

  // Poll socket until ready (or timeout)
  const maxAttempts = 50; // 50 * 100ms = 5s max
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const socket = await connectToService();
      socket.end();
      console.log("Service ready");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.error("Service failed to start. Check logs:");
  console.error(`  tail -f ${SERVICE_LOG_FILE}`);
  process.exit(1);
}

/**
 * Stop the service
 */
export async function stopService(): Promise<void> {
  const status = isServiceRunning();

  if (!status.running) {
    console.log("Service is not running");
    return;
  }

  try {
    // Try graceful shutdown via IPC
    const socket = await connectToService();
    sendMessage(socket, { type: "shutdown" });
    socket.end();
    console.log("Shutdown signal sent");

    // Wait for process to exit
    await new Promise((r) => setTimeout(r, 1000));

    const newStatus = isServiceRunning();
    if (newStatus.running) {
      // Force kill
      process.kill(status.pid!, "SIGTERM");
      console.log(`Sent SIGTERM to PID ${status.pid}`);
    }
  } catch {
    // IPC failed, try direct signal
    if (status.pid) {
      process.kill(status.pid, "SIGTERM");
      console.log(`Sent SIGTERM to PID ${status.pid}`);
    }
  }
}

/**
 * Show service status
 */
export async function serviceStatus(): Promise<void> {
  const status = isServiceRunning();

  if (!status.running) {
    console.log("Service: not running");
    return;
  }

  console.log(`Service: running (PID: ${status.pid})`);

  try {
    const socket = await connectToService();
    sendMessage(socket, { type: "status" });

    const response = await waitForResponse<StatusResponse>(socket, "status_response");
    socket.end();

    console.log(`Connections: ${response.connections}`);
    console.log(`Watching: ${response.watching}`);
    console.log(`Uptime: ${Math.round(response.uptime / 1000)}s`);

    if (response.lastEvent) {
      const ago = Math.round((Date.now() - response.lastEvent.timestamp) / 1000);
      console.log(`Last event: ${response.lastEvent.type} (${ago}s ago)`);
      console.log(`  Path: ${response.lastEvent.path}`);
    }
  } catch {
    console.log("Could not connect to service for status");
  }
}

/**
 * Tail the watcher logs
 */
export async function serviceLogs(): Promise<void> {
  if (!existsSync(WATCHER_LOG_FILE)) {
    console.log("No watcher logs yet");
    console.log(`Log file: ${WATCHER_LOG_FILE}`);
    return;
  }

  console.log(`Tailing ${WATCHER_LOG_FILE} (Ctrl+C to stop)\n`);

  // Read last 20 lines first
  const content = readFileSync(WATCHER_LOG_FILE, "utf-8");
  const lines = content.trim().split("\n");
  const lastLines = lines.slice(-20);

  for (const line of lastLines) {
    try {
      const event = JSON.parse(line);
      const date = new Date(event.timestamp).toISOString();
      console.log(`[${date}] ${event.type}: ${event.path}`);
    } catch {
      console.log(line);
    }
  }

  // Then tail
  const { spawn } = await import("child_process");
  const tail = spawn("tail", ["-f", WATCHER_LOG_FILE], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  const rl = createInterface({ input: tail.stdout! });

  rl.on("line", (line) => {
    try {
      const event = JSON.parse(line);
      const date = new Date(event.timestamp).toISOString();
      console.log(`[${date}] ${event.type}: ${event.path}`);
    } catch {
      console.log(line);
    }
  });

  // Keep process alive
  await new Promise(() => {});
}
