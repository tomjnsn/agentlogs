/**
 * IPC utilities for service communication via Unix socket
 */

import { createServer, connect, type Socket, type Server } from "net";
import { existsSync, unlinkSync } from "fs";
import { SERVICE_SOCKET_PATH } from "./paths";

export interface IPCMessage {
  type: "connect" | "disconnect" | "status" | "status_response" | "shutdown";
  id?: string;
  data?: Record<string, unknown>;
}

export interface StatusResponse {
  connections: number;
  watching: boolean;
  lastEvent?: {
    type: string;
    path: string;
    timestamp: number;
  };
  uptime: number;
}

/**
 * Create the IPC server (used by the service)
 */
export function createIPCServer(handlers: {
  onConnect: (id: string, socket: Socket) => void;
  onDisconnect: (id: string) => void;
  onStatus: () => StatusResponse;
  onShutdown: () => void;
}): Server {
  // Clean up stale socket file
  if (existsSync(SERVICE_SOCKET_PATH)) {
    try {
      unlinkSync(SERVICE_SOCKET_PATH);
    } catch {
      // Ignore - might be in use
    }
  }

  const server = createServer((socket) => {
    let connId: string | null = null;
    let buffer = "";

    socket.on("data", (data) => {
      buffer += data.toString();

      // Handle multiple messages in buffer (newline-delimited)
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const msg: IPCMessage = JSON.parse(line);

          switch (msg.type) {
            case "connect":
              connId = msg.id || crypto.randomUUID();
              handlers.onConnect(connId, socket);
              break;

            case "disconnect":
              if (connId) {
                handlers.onDisconnect(connId);
              }
              break;

            case "status":
              const status = handlers.onStatus();
              socket.write(JSON.stringify({ type: "status_response", data: status }) + "\n");
              break;

            case "shutdown":
              handlers.onShutdown();
              break;
          }
        } catch {
          // Invalid JSON, ignore
        }
      }
    });

    socket.on("close", () => {
      if (connId) {
        handlers.onDisconnect(connId);
        connId = null;
      }
    });

    socket.on("error", () => {
      if (connId) {
        handlers.onDisconnect(connId);
        connId = null;
      }
    });
  });

  server.listen(SERVICE_SOCKET_PATH);
  return server;
}

/**
 * Connect to the IPC server (used by MCP server and CLI commands)
 */
export function connectToService(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(SERVICE_SOCKET_PATH);

    socket.on("connect", () => {
      resolve(socket);
    });

    socket.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Send a message to the service and optionally wait for response
 */
export function sendMessage(socket: Socket, msg: IPCMessage): void {
  socket.write(JSON.stringify(msg) + "\n");
}

/**
 * Wait for a response message of a specific type
 */
export function waitForResponse<T>(socket: Socket, type: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for response"));
    }, timeout);

    const handler = (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === type) {
            clearTimeout(timer);
            socket.off("data", handler);
            resolve(msg.data as T);
          }
        } catch {
          // Ignore
        }
      }
    };

    socket.on("data", handler);
  });
}
