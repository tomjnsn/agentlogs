#!/bin/bash
# Dev teardown script for @agentlogs/pi extension
#
# Removes the symlink created by dev-setup.sh

set -e

EXTENSIONS_DIR="$HOME/.pi/agent/extensions"
LINK_PATH="$EXTENSIONS_DIR/agentlogs"

if [ -L "$LINK_PATH" ]; then
  rm "$LINK_PATH"
  echo "Removed symlink: $LINK_PATH"
else
  echo "No symlink found at: $LINK_PATH"
fi

echo ""
echo "Don't forget to unset AGENTLOGS_CLI_PATH if you set it:"
echo ""
echo "  unset AGENTLOGS_CLI_PATH"
