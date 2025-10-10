# Implementation Plan: packages/plugin

## Key Goals

1. Capture Claude Code transcripts via SessionEnd hook
2. Upload to server with simple HTTP POST
3. Fail-open architecture - never block IDE
4. Type-safe TypeScript

## Constraints

- TypeScript executed via Bun
- Use `@anthropic-ai/claude-code` SDK types
- No retry logic - try once, log and continue
- Simple git metadata extraction
- POC focus: happy path only

## File Structure

```
packages/plugin/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── session-end.ts
├── src/
│   ├── types.ts
│   └── upload.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Implementation

### File 1: `.claude-plugin/plugin.json`

```json
{
  "name": "aei-transcript-logger",
  "version": "0.1.0",
  "description": "Captures Claude Code transcripts and uploads to AEI server for observability analysis",
  "author": {
    "name": "AEI Team",
    "email": "team@aei.dev",
    "url": "https://github.com/aei"
  },
  "homepage": "https://aei.dev/docs/plugin",
  "repository": "https://github.com/aei/transcript-logger-plugin",
  "license": "MIT",
  "keywords": ["observability", "analytics", "transcripts", "telemetry"],
  "hooks": "./hooks/hooks.json"
}
```

### File 2: `hooks/hooks.json`

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/session-end.ts"
          }
        ]
      }
    ]
  }
}
```

### File 3: `src/types.ts`

```typescript
// Transcript Event Types - Pure TypeScript (no runtime validation)

interface BaseTranscriptEvent {
  sessionId: string;
  uuid: string;
  timestamp: string;
}

export interface UserMessageEvent extends BaseTranscriptEvent {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
  cwd: string;
  gitBranch?: string;
  version?: string;
  userType?: string;
  parentUuid: string | null;
  isSidechain?: boolean;
}

export interface AssistantMessageEvent extends BaseTranscriptEvent {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{
      type: string;
      text?: string;
      [key: string]: unknown; // For other content types
    }>;
  };
}

export interface ToolUseEvent extends BaseTranscriptEvent {
  type: 'tool_use';
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ToolResultEvent extends BaseTranscriptEvent {
  type: 'tool_result';
  tool_name: string;
  tool_response: Record<string, unknown>;
  success?: boolean;
  error?: string;
}

// Union type for all transcript events
export type TranscriptEvent =
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolUseEvent
  | ToolResultEvent;

// ========== Upload Payload ==========

export interface UploadPayload {
  repoId: string;
  repoName: string;
  sessionId: string;
  events: TranscriptEvent[]; // Typed events
  metadata: {
    cwd: string;
    reason: string;
    eventCount: number;
  };
}

export interface UploadResponse {
  success: boolean;
  transcriptId: string;
  eventsReceived: number;
}
```

### File 4: `src/upload.ts`

```typescript
import type { UploadPayload, UploadResponse } from './types';
import { execSync } from 'child_process';

// Configuration from environment
const SERVER_URL = process.env.AEI_SERVER_URL || 'http://localhost:3000';
const API_TOKEN = process.env.AEI_API_TOKEN || 'dev_token';
const TIMEOUT_MS = 10000; // 10 second timeout

/**
 * Upload transcript to AEI server
 * Returns success status and optional transcript ID
 */
export async function uploadTranscript(
  payload: UploadPayload
): Promise<{ success: boolean; transcriptId?: string }> {
  try {
    const response = await fetch(`${SERVER_URL}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) {
      const result: UploadResponse = await response.json();
      return {
        success: true,
        transcriptId: result.transcriptId
      };
    }

    console.error(`Upload failed: ${response.status} ${response.statusText}`);
    return { success: false };
  } catch (error) {
    if (error instanceof Error) {
      console.error('Upload error:', error.message);
    }
    return { success: false };
  }
}

/**
 * Get repository metadata from git
 * Falls back to local path if not a git repo
 */
export function getRepoMetadata(cwd: string): {
  repoId: string;
  repoName: string;
} {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
    }).trim();

    const repoName = remoteUrl.split('/').pop()?.replace('.git', '') || 'unknown';

    return {
      repoId: remoteUrl,
      repoName,
    };
  } catch {
    // Not a git repo or git command failed
    const repoName = cwd.split('/').pop() || 'unknown';
    return {
      repoId: `file://${cwd}`,
      repoName,
    };
  }
}
```

### File 5: `hooks/session-end.ts`

```typescript
#!/usr/bin/env bun

import type { SessionEndHookInput } from '@anthropic-ai/claude-code';
import { readFileSync } from 'fs';
import { uploadTranscript, getRepoMetadata } from '../src/upload';
import type { TranscriptEvent } from '../src/types';

// ✅ Use SDK type directly - no Zod needed
const input = await Bun.stdin.json() as SessionEndHookInput;
const { session_id, transcript_path, cwd, reason } = input;

// Configuration
const UPLOAD_ENABLED = process.env.AEI_UPLOAD_ENABLED !== 'false';

try {
  if (!UPLOAD_ENABLED) {
    console.log('⊘ AEI upload disabled (set AEI_UPLOAD_ENABLED=true to enable)');
    process.exit(0);
  }

  // Read and parse transcript file
  // TypeScript provides compile-time safety, server does runtime validation
  const transcriptContent = readFileSync(transcript_path, 'utf8');
  const events = transcriptContent
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line) as TranscriptEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is TranscriptEvent => event !== null);

  if (events.length === 0) {
    console.log('⊘ No events in transcript');
    process.exit(0);
  }

  // Get repository metadata
  const { repoId, repoName } = getRepoMetadata(cwd);

  // Upload to server (server validates)
  const result = await uploadTranscript({
    repoId,
    repoName,
    sessionId: session_id,
    events, // Raw events, server handles validation
    metadata: { cwd, reason, eventCount: events.length },
  });

  if (result.success) {
    console.log(`✓ Uploaded ${events.length} events to AEI (ID: ${result.transcriptId})`);
  } else {
    console.error('✗ Failed to upload transcript to AEI server');
  }
} catch (error) {
  if (error instanceof Error) {
    console.error('✗ Hook error:', error.message);
  }
} finally {
  // Always exit successfully (fail-open architecture)
  // Never block Claude Code from exiting
  process.exit(0);
}
```

### File 6: `package.json`

```json
{
  "name": "@aei/plugin",
  "version": "0.1.0",
  "type": "module",
  "description": "AEI transcript capture plugin for Claude Code",
  "main": "./hooks/session-end.ts",
  "scripts": {
    "test": "bun test"
  },
  "dependencies": {
    "@anthropic-ai/claude-code": "^1.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

### File 7: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "hooks/**/*"]
}
```

### File 8: `README.md`

```markdown
# AEI Transcript Logger Plugin

Captures Claude Code session transcripts and uploads them to your AEI server for observability analysis.

## Installation

1. Install the plugin via Claude Code:
   ```
   /plugin install aei-transcript-logger@your-marketplace
   ```

2. Configure environment variables:
   ```bash
   export AEI_SERVER_URL="https://aei.yourcompany.com"
   export AEI_API_TOKEN="your-api-token-here"
   export AEI_UPLOAD_ENABLED="true"
   ```

3. Enable the plugin:
   ```
   /plugin enable aei-transcript-logger
   ```

## How It Works

- **Automatic capture**: Triggers on SessionEnd hook (when you `/exit` or Ctrl+D)
- **Full transcript**: Captures entire session including user messages, assistant responses, and tool calls
- **Fail-open**: Never blocks Claude Code from exiting, even if upload fails
- **Privacy-first**: Only uploads when explicitly enabled via environment variable

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AEI_SERVER_URL` | `http://localhost:3000` | AEI server endpoint |
| `AEI_API_TOKEN` | `dev_token` | Authentication token |
| `AEI_UPLOAD_ENABLED` | `true` | Set to `false` to disable uploads |

## Privacy & Security

Transcripts contain your entire conversation history including code, file contents, and tool usage. Ensure:
- Your AEI server is self-hosted or trusted
- `AEI_API_TOKEN` is kept secure
- You understand what data is being captured

To disable: `export AEI_UPLOAD_ENABLED=false`

## Troubleshooting

Check upload logs: Look for `✓` (success) or `✗` (failure) messages in Claude Code output after session end.
```

---

## Testing Checklist

### Local Testing

```bash
# Install dependencies
cd packages/plugin
bun install

# Test hook with mock input
echo '{
  "session_id": "test-123",
  "transcript_path": "/path/to/test-transcript.jsonl",
  "cwd": "/path/to/repo",
  "hook_event_name": "SessionEnd",
  "reason": "user_exit"
}' | bun run hooks/session-end.ts

# Should output: ✓ Uploaded N events to AEI (ID: ...)
```

### Integration Testing

```bash
# 1. Start AEI server
cd packages/server
bun run --watch src/index.ts

# 2. Install plugin in Claude Code
mkdir -p ~/.claude/plugins
cp -r packages/plugin ~/.claude/plugins/aei-transcript-logger

# 3. Run a Claude Code session
claude-code
# ... do some work ...
/exit

# 4. Check server logs for upload
# Should see: POST /api/ingest - 200
```

### Manual Verification

- [ ] Plugin loads in Claude Code without errors
- [ ] SessionEnd hook fires on `/exit`
- [ ] Transcript is successfully uploaded
- [ ] Server receives and stores data
- [ ] Hook never blocks Claude Code exit
- [ ] Non-git directories don't crash
- [ ] Network errors are handled gracefully

---

## Environment Variables

```bash
# Required for production
export AEI_SERVER_URL="https://aei.yourcompany.com"
export AEI_API_TOKEN="production-token-here"
export AEI_UPLOAD_ENABLED="true"

# Optional for development
export AEI_SERVER_URL="http://localhost:3000"
export AEI_API_TOKEN="dev_token"
```

---

---

**Time to Implement**: 1 hour
**Next**: Follow `docs/03-implementation-plan-server-v2.md`
