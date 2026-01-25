/**
 * MCP Server Command
 *
 * This command is spawned by Codex as an MCP server.
 * It:
 * 1. Ensures the agentlogs service is running
 * 2. Connects to the service via Unix socket
 * 3. Runs an MCP server with 0 tools/prompts (just keeps service alive)
 *
 * Usage (in Codex config):
 *   agentlogs mcp
 */

import { spawn } from "child_process";
import { existsSync, readFileSync, appendFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { Socket } from "net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, ListPromptsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SERVICE_PID_FILE, AGENTLOGS_DIR } from "../../service/paths";
import { connectToService, sendMessage } from "../../service/ipc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MCP_LOG_FILE = resolve(AGENTLOGS_DIR, "mcp.log");

function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [mcp] ${message}\n`;
  try {
    appendFileSync(MCP_LOG_FILE, line);
  } catch {
    // Ignore
  }
}

/**
 * Check if service is running
 */
function isServiceRunning(): boolean {
  if (!existsSync(SERVICE_PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(SERVICE_PID_FILE, "utf-8").trim());
    process.kill(pid, 0); // Just check if alive
    return true;
  } catch {
    return false;
  }
}

/**
 * Start the service as a detached process
 */
async function ensureServiceRunning(): Promise<void> {
  if (isServiceRunning()) {
    log("Service already running");
    return;
  }

  log("Starting service...");

  // Path to the service server script
  const serverPath = resolve(__dirname, "../../service/server.ts");
  const serverDistPath = resolve(__dirname, "../../service/server.js");
  const scriptPath = existsSync(serverPath) ? serverPath : serverDistPath;

  if (!existsSync(scriptPath)) {
    log(`Service script not found: ${scriptPath}`);
    throw new Error("Service script not found");
  }

  // Spawn detached process
  const child = spawn("bun", ["run", scriptPath], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });

  child.unref();
  log(`Service spawned (PID: ${child.pid})`);

  // Poll socket until ready (or timeout)
  const maxAttempts = 50; // 50 * 100ms = 5s max
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const socket = await connectToService();
      socket.end();
      log("Service ready");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  throw new Error("Service failed to start");
}

/**
 * Connect to the service and register this MCP connection
 */
async function connectAndRegister(): Promise<Socket> {
  const socket = await connectToService();
  const connId = crypto.randomUUID();

  sendMessage(socket, { type: "connect", id: connId });
  log(`Connected to service with ID: ${connId}`);

  return socket;
}

/**
 * Main MCP server
 */
export async function mcpCommand(): Promise<void> {
  log("MCP server starting");

  let serviceSocket: Socket | null = null;

  try {
    // Ensure service is running and connect
    await ensureServiceRunning();
    serviceSocket = await connectAndRegister();
  } catch (err) {
    log(`Failed to connect to service: ${err instanceof Error ? err.message : String(err)}`);
    // Continue anyway - MCP server can work without the service
  }

  // Create MCP server with no tools/prompts
  const server = new Server({ name: "agentlogs", version: "0.0.1" }, { capabilities: { tools: {}, prompts: {} } });

  // Register empty handlers for tools and prompts
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
  server.setRequestHandler(ListPromptsRequestSchema, () => ({ prompts: [] }));

  // Handle process termination
  const cleanup = () => {
    log("Shutting down");
    if (serviceSocket) {
      serviceSocket.end();
    }
  };

  process.on("SIGTERM", () => {
    log("Received SIGTERM");
    cleanup();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    log("Received SIGINT");
    cleanup();
    process.exit(0);
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();

  log("MCP server connecting to transport");
  await server.connect(transport);
  log("MCP server ready");
}
