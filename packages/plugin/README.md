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
| `AEI_SERVER_URL` | `http://localhost:8787` | AEI server endpoint |
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
