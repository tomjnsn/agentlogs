# Vibe Insights Transcript Logger Plugin

Captures Claude Code session transcripts and uploads them to your Vibe Insights server for observability analysis.

## Installation

1. Install the plugin via Claude Code:

   ```
   /plugin install vibeinsights-transcript-logger@your-marketplace
   ```

2. Configure environment variables:

   ```bash
   export VI_SERVER_URL="https://vibeinsights.yourcompany.com"
   export VI_API_TOKEN="your-api-token-here"
   export VI_UPLOAD_ENABLED="true"
   ```

3. Enable the plugin:
   ```
   /plugin enable vibeinsights-transcript-logger
   ```

## How It Works

- **Automatic capture**: Triggers on SessionEnd hook (when you `/exit` or Ctrl+D)
- **Full transcript**: Captures entire session including user messages, assistant responses, and tool calls
- **Fail-open**: Never blocks Claude Code from exiting, even if upload fails
- **Privacy-first**: Only uploads when explicitly enabled via environment variable

## Configuration

| Variable            | Default                 | Description                       |
| ------------------- | ----------------------- | --------------------------------- |
| `VI_SERVER_URL`     | `http://localhost:8787` | VI server endpoint                |
| `VI_API_TOKEN`      | `dev_token`             | Authentication token              |
| `VI_UPLOAD_ENABLED` | `true`                  | Set to `false` to disable uploads |

## Privacy & Security

Transcripts contain your entire conversation history including code, file contents, and tool usage. Ensure:

- Your VI server is self-hosted or trusted
- `VI_API_TOKEN` is kept secure
- You understand what data is being captured

To disable: `export VI_UPLOAD_ENABLED=false`

## Troubleshooting

Check upload logs: Look for `✓` (success) or `✗` (failure) messages in Claude Code output after session end.
