#!/bin/bash
# Dev setup script for @agentlogs/pi extension
#
# This script:
# 1. Creates a symlink in ~/.pi/agent/extensions/
# 2. Prints the AGENTLOGS_CLI_PATH to set

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
EXTENSIONS_DIR="$HOME/.pi/agent/extensions"

echo "Setting up @agentlogs/pi for development..."
echo ""

# Create extensions directory if needed
mkdir -p "$EXTENSIONS_DIR"

# Create symlink
LINK_PATH="$EXTENSIONS_DIR/agentlogs"
if [ -L "$LINK_PATH" ]; then
  echo "Removing existing symlink: $LINK_PATH"
  rm "$LINK_PATH"
elif [ -e "$LINK_PATH" ]; then
  echo "Warning: $LINK_PATH exists but is not a symlink. Skipping."
  exit 1
fi

ln -s "$PACKAGE_DIR" "$LINK_PATH"
echo "Created symlink: $LINK_PATH -> $PACKAGE_DIR"
echo ""

# Print CLI path
CLI_PATH="bun $REPO_ROOT/packages/cli/src/index.ts"
echo "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
echo ""
echo "  export AGENTLOGS_CLI_PATH=\"$CLI_PATH\""
echo ""
echo "Or run pi with it set:"
echo ""
echo "  AGENTLOGS_CLI_PATH=\"$CLI_PATH\" pi"
echo ""
echo "Done! The extension will be loaded automatically when you start pi."
echo "Debug logs are written to: /tmp/agentlogs-pi.log"
