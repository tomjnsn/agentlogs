# MCP Daemon & Git Hook Integration Proposal

## Overview

Add real-time transcript capture for agents without native plugin support (Codex, Cursor, etc.) via an MCP server that coordinates through a singleton daemon. Enable automatic commit attribution by correlating git commits with active agent sessions.

## Problem

- **Claude Code / OpenCode**: Have plugin APIs, can hook into agent lifecycle directly
- **Codex / Cursor / others**: No plugin API, currently only support post-hoc log parsing
- **Commit attribution**: No way to automatically detect if a commit was AI-assisted without manual tagging

## Solution

Three components working together:

```
┌─────────────────────────┐
│  MCP Server (per agent) │ ← Thin client, spawned by each agent
└───────────┬─────────────┘
            │ IPC (Unix socket)
            ▼
┌─────────────────────────┐
│  Singleton Daemon       │ ← Coordinates all agents, owns state
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Git commit-msg Hook    │ ← Queries daemon for attribution
└─────────────────────────┘
```

---

## Component 1: MCP Server

Lightweight MCP server that agents spawn. Its only job is to forward events to the daemon.

### Registration

When the MCP server starts, it:

1. Attempts to connect to existing daemon via Unix socket
2. If no daemon exists, spawns one (detached) and waits for socket
3. Registers session with daemon: `{ agent: "codex", cwd, pid, sessionId }`

### MCP Tools Exposed

Minimal tool surface - just enough to capture activity:

```typescript
const tools = [
  {
    name: "agentlogs_ping",
    description: "Health check / session keepalive",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "agentlogs_status",
    description: "Get current session tracking status",
    inputSchema: { type: "object", properties: {} },
  },
];
```

The MCP server passively observes tool calls made by the agent (via MCP protocol) and forwards them to the daemon. No active tool use required from the agent.

### Event Forwarding

```typescript
// Forward all MCP events to daemon
mcpServer.on("tool_call", (event) => {
  daemon.send({ type: "tool_call", sessionId, event });
});

mcpServer.on("message", (event) => {
  daemon.send({ type: "message", sessionId, event });
});
```

---

## Component 2: Singleton Daemon

Long-running process that coordinates all agent sessions and owns the transcript state.

### Leader Election / Singleton Pattern

Use Unix socket as lock mechanism:

```typescript
const SOCKET_PATH = "/tmp/agentlogs.sock";
const PID_FILE = "/tmp/agentlogs.pid";

async function ensureDaemon(): Promise<Socket> {
  // Try to connect to existing daemon
  try {
    const socket = await Bun.connect({ unix: SOCKET_PATH });
    return socket; // Daemon already running
  } catch {
    // No daemon, we need to spawn one
  }

  // Check stale PID file
  if (await Bun.file(PID_FILE).exists()) {
    const pid = parseInt(await Bun.file(PID_FILE).text());
    if (!isProcessRunning(pid)) {
      await unlink(PID_FILE);
      await unlink(SOCKET_PATH).catch(() => {});
    }
  }

  // Spawn detached daemon
  const child = Bun.spawn(["bun", "daemon.ts"], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();

  // Wait for socket to become available
  await waitForSocket(SOCKET_PATH, { timeout: 5000 });
  return Bun.connect({ unix: SOCKET_PATH });
}
```

### Session Management

```typescript
type AgentSession = {
  id: string;
  agent: "codex" | "cursor" | "windsurf" | string;
  cwd: string;
  pid: number;
  startedAt: Date;
  lastActivity: Date;
  events: TranscriptEvent[];
};

const sessions = new Map<string, AgentSession>();

// Heartbeat / cleanup
setInterval(() => {
  const staleThreshold = Date.now() - 5 * 60 * 1000; // 5 min
  for (const [id, session] of sessions) {
    if (session.lastActivity.getTime() < staleThreshold) {
      // Flush transcript and remove
      flushSession(session);
      sessions.delete(id);
    }
  }
}, 30_000);
```

### Client Reference Counting

```typescript
const clients = new Set<Socket>();

server.on("connection", (socket) => {
  clients.add(socket);

  socket.on("close", () => {
    clients.delete(socket);

    if (clients.size === 0) {
      // Grace period before shutdown
      setTimeout(() => {
        if (clients.size === 0) {
          flushAllSessions();
          process.exit(0);
        }
      }, 60_000); // 1 min grace
    }
  });
});
```

### Git Hook Query Endpoint

Daemon exposes an endpoint for git hooks to query:

```typescript
// Handle git hook queries
if (message.type === "query_commit") {
  const { cwd, commitMessage } = message;

  // Find active sessions in this directory
  const matchingSessions = [...sessions.values()].filter((s) => s.cwd === cwd && isRecentlyActive(s));

  if (matchingSessions.length > 0) {
    // Return session info for commit attribution
    return {
      isAgentAssisted: true,
      sessions: matchingSessions.map((s) => ({
        agent: s.agent,
        sessionId: s.id,
      })),
    };
  }

  return { isAgentAssisted: false };
}
```

---

## Component 3: Git commit-msg Hook

Queries the daemon to determine if the commit is AI-assisted.

### Hook Script

```bash
#!/bin/sh
# .git/hooks/commit-msg

# Query agentlogs daemon (if running)
result=$(agentlogs hook query-commit --cwd "$(pwd)" --message-file "$1" 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$result" ]; then
  # Append attribution to commit message
  echo "" >> "$1"
  echo "$result" >> "$1"
fi

# Always succeed - don't block commits if daemon isn't running
exit 0
```

### CLI Command

```typescript
// packages/cli/src/commands/hook.ts

export async function queryCommit(cwd: string, messageFile: string) {
  const socket = await connectToDaemon().catch(() => null);
  if (!socket) {
    return; // Daemon not running, no attribution
  }

  const response = await socket.send({
    type: "query_commit",
    cwd,
    commitMessage: await Bun.file(messageFile).text(),
  });

  if (response.isAgentAssisted) {
    // Output git trailer format
    const agents = response.sessions.map((s) => s.agent).join(", ");
    console.log(`Agent-Assisted-By: ${agents}`);

    // Optionally include session IDs for transcript linking
    for (const session of response.sessions) {
      console.log(`Agent-Session: ${session.sessionId}`);
    }
  }
}
```

### Attribution Format

Use git trailer format (parseable by tools):

```
Fix authentication bug in login flow

Agent-Assisted-By: codex
Agent-Session: codex-1736956800000
```

---

## Installation & Setup

### Install Command

```bash
agentlogs install
```

This command:

1. Sets up global git hooks directory (`~/.config/agentlogs/hooks/`)
2. Configures git to use it (`git config --global core.hooksPath`)
3. Installs the `commit-msg` hook
4. Provides MCP configuration snippet for user to add to their agent config

### MCP Configuration

User adds to their Codex/Cursor MCP config:

```json
{
  "mcpServers": {
    "agentlogs": {
      "command": "agentlogs",
      "args": ["mcp", "serve"]
    }
  }
}
```

### Uninstall

```bash
agentlogs uninstall
```

Removes hooks, restores default git config.

---

## Data Flow

### During Agent Session

```
1. Agent starts → spawns MCP server
2. MCP server → ensures daemon running → registers session
3. Agent makes tool calls → MCP forwards to daemon
4. Daemon accumulates transcript in memory
5. Periodic flush to local storage (~/.agentlogs/pending/)
```

### On Git Commit

```
1. User runs `git commit`
2. commit-msg hook fires
3. Hook queries daemon: "any active sessions in this cwd?"
4. Daemon returns session info
5. Hook appends Agent-Assisted-By trailer
6. Commit completes with attribution
```

### Session End

```
1. Agent exits → MCP server disconnects
2. Daemon detects disconnect
3. Daemon finalizes transcript
4. Upload to agentlogs.ai (if authenticated)
5. Remove from pending queue
```

---

## Failure Modes & Recovery

| Scenario                     | Behavior                                                          |
| ---------------------------- | ----------------------------------------------------------------- |
| Daemon not running           | Hook exits silently, no attribution                               |
| Daemon crashes mid-session   | Next MCP connect respawns it, session lost but no data corruption |
| Upload fails                 | Transcript stays in pending queue, retry on next opportunity      |
| Multiple agents same cwd     | All sessions returned in commit attribution                       |
| Stale session (agent killed) | Cleaned up after 5 min inactivity                                 |

### Idempotency

All uploads use the existing idempotent API:

- Same transcript re-uploaded → returns `status: "unchanged"`
- Blobs deduplicated by SHA256
- Safe to retry failed uploads

---

## File Structure

```
packages/
├── cli/
│   └── src/
│       ├── commands/
│       │   ├── install.ts      # Setup git hooks
│       │   ├── uninstall.ts    # Remove git hooks
│       │   └── hook.ts         # Hook CLI commands
│       └── mcp/
│           └── server.ts       # MCP server entry
├── daemon/                     # New package
│   ├── package.json
│   └── src/
│       ├── index.ts            # Daemon entry
│       ├── sessions.ts         # Session management
│       ├── socket.ts           # IPC handling
│       └── flush.ts            # Transcript finalization
└── shared/
    └── src/
        └── ipc.ts              # Shared IPC types/protocol
```

---

## Files to Create/Modify

| Action | File                                     |
| ------ | ---------------------------------------- |
| Create | `packages/daemon/package.json`           |
| Create | `packages/daemon/src/index.ts`           |
| Create | `packages/daemon/src/sessions.ts`        |
| Create | `packages/daemon/src/socket.ts`          |
| Create | `packages/daemon/src/flush.ts`           |
| Create | `packages/cli/src/mcp/server.ts`         |
| Create | `packages/cli/src/commands/install.ts`   |
| Create | `packages/cli/src/commands/uninstall.ts` |
| Modify | `packages/cli/src/commands/hook.ts`      |
| Create | `packages/shared/src/ipc.ts`             |

---

## Open Questions

1. **Hook installation strategy**: Global `core.hooksPath` vs per-repo hooks?
   - Global: simpler, but overrides project hooks
   - Per-repo: more complex install, respects project hooks

2. **Transcript storage during session**: Memory only or periodic disk flush?
   - Memory: simpler, risk of data loss on crash
   - Disk: more durable, more I/O

3. **Session correlation**: Match by cwd only, or also try to match commit message to recent prompts?
   - cwd only: simple, might have false positives
   - Message matching: more accurate, more complex, error-prone

4. **Multiple workspaces**: How to handle agents working across multiple directories?
   - Track cwd changes within session
   - Multiple sessions per agent

---

## Verification

1. **Unit tests**: Session management, IPC protocol, hook query logic
2. **Integration tests**:
   - MCP server → daemon communication
   - Daemon respawn on crash
   - Hook → daemon query flow
3. **Manual testing**:
   - Install agentlogs, configure MCP in Codex
   - Start Codex session, make changes
   - Run `git commit` → verify trailer added
   - Check transcript uploaded to agentlogs.ai
4. **Run existing tests**: `bun run test` and `bun run test:e2e`
5. **Lint/format**: `bun run format`
