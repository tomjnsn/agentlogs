# agentlogs

CLI for uploading and syncing AI coding agent transcripts to [AgentLogs](https://agentlogs.ai).

## Install

```bash
npm install -g agentlogs
```

## Usage

```bash
# Authenticate
agentlogs login
agentlogs status
agentlogs logout

# Claude Code
agentlogs claudecode upload <transcript.jsonl>
agentlogs claudecode sync              # sync all local transcripts
agentlogs claudecode hook              # for use with Claude Code hooks

# Codex
agentlogs codex upload <transcript.jsonl>

# OpenCode
agentlogs opencode upload <sessionId>
agentlogs opencode hook

# Repository settings
agentlogs allow --public   # allow capture for current repo
agentlogs deny             # deny capture for current repo
agentlogs settings         # view/modify settings
```

## License

MIT
