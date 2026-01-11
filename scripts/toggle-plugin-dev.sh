#!/usr/bin/env bash
#
# Toggle AgentLogs Plugin Development Mode
#
# This script automatically detects the current plugin mode and switches to the opposite:
# - Production → Local Development: Sets VI_CLI_PATH and VI_SERVER_URL
# - Local Development → Production: Removes environment variables from shell RC
#
# The script updates your shell configuration file (.zshrc or .bashrc) to persist
# the changes across terminal sessions.
#
# Usage: npm run plugin:switch-dev  (or plugin:switch-prod - both do the same thing)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_PATH="bun $REPO_ROOT/packages/cli/src/index.ts"

# Detect user's shell (from $SHELL, not the script interpreter)
case "$SHELL" in
  */zsh)
    SHELL_RC="$HOME/.zshrc"
    ;;
  */bash)
    SHELL_RC="$HOME/.bashrc"
    ;;
  *)
    echo "⚠️  Unsupported shell (only bash and zsh are supported)"
    exit 1
    ;;
esac

# Check current mode and toggle
if [ -n "$VI_CLI_PATH" ]; then
  # Currently in LOCAL DEV → Switch to PRODUCTION
  echo "🚀 Switching to PRODUCTION mode..."
  echo

  # Remove the AgentLogs section from RC file
  if grep -q "# AgentLogs - Local Development" "$SHELL_RC" 2>/dev/null; then
    sed -i.bak '/# AgentLogs - Local Development/,/^$/d' "$SHELL_RC"
    echo "  ✅ Removed local dev config from $SHELL_RC"
  fi

  # Unset for current session
  unset VI_CLI_PATH VI_SERVER_URL

  echo
  echo "✅ Now in PRODUCTION mode"
  echo "  CLI: npx -y @agentlogs/cli@latest"
  echo
  echo "⚠️  Restart your terminal or run: source $SHELL_RC"
else
  # Currently in PRODUCTION → Switch to LOCAL DEV
  echo "🔧 Switching to LOCAL DEVELOPMENT mode..."
  echo

  # Remove existing config if present
  if grep -q "# AgentLogs - Local Development" "$SHELL_RC" 2>/dev/null; then
    sed -i.bak '/# AgentLogs - Local Development/,/^$/d' "$SHELL_RC"
  fi

  # Add exports to RC file
  cat >> "$SHELL_RC" << EOF

# AgentLogs - Local Development
export VI_CLI_PATH="$CLI_PATH"
export VI_SERVER_URL="http://localhost:3000"

EOF

  # Set for current session
  export VI_CLI_PATH="$CLI_PATH"
  export VI_SERVER_URL="http://localhost:3000"

  echo "  ✅ Added local dev config to $SHELL_RC"
  echo

  # Check if already authenticated
  echo "🔐 Checking authentication status..."
  if eval "$VI_CLI_PATH" status 2>&1 | grep -q "Logged in"; then
    echo "  ✅ Already authenticated"
  else
    echo "  🔓 Not authenticated - starting login flow..."
    if eval "$VI_CLI_PATH" login; then
      echo "  ✅ Authentication successful"
    else
      echo "  ⚠️  Authentication failed (you can login later with: bun run cli login)"
    fi
  fi

  echo
  echo "✅ Now in LOCAL DEVELOPMENT mode"
  echo "  CLI: $VI_CLI_PATH"
  echo "  Server: http://localhost:3000"
  echo
  echo "⚠️  Restart your terminal or run: source $SHELL_RC"
fi
