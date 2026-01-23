#!/usr/bin/env bash
# Setup script for developing the OpenCode plugin locally
#
# Usage:
#   ./scripts/setup-opencode-plugin.sh          # Symlink plugin for dev
#   ./scripts/setup-opencode-plugin.sh --remove # Remove symlink

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PLUGIN_SRC="$REPO_ROOT/packages/opencode/src/index.ts"
OPENCODE_PLUGINS_DIR="$HOME/.config/opencode/plugins"
SYMLINK_PATH="$OPENCODE_PLUGINS_DIR/agentlogs.ts"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [[ "$1" == "--remove" ]]; then
    if [[ -L "$SYMLINK_PATH" ]]; then
        rm "$SYMLINK_PATH"
        echo -e "${GREEN}✓${NC} Removed symlink: $SYMLINK_PATH"
    else
        echo -e "${YELLOW}!${NC} No symlink found at: $SYMLINK_PATH"
    fi
    exit 0
fi

if [[ ! -f "$PLUGIN_SRC" ]]; then
    echo -e "${RED}✗${NC} Plugin not found: $PLUGIN_SRC"
    exit 1
fi

mkdir -p "$OPENCODE_PLUGINS_DIR"

# Remove existing symlink
[[ -L "$SYMLINK_PATH" ]] && rm "$SYMLINK_PATH"

ln -s "$PLUGIN_SRC" "$SYMLINK_PATH"
echo -e "${GREEN}✓${NC} Symlinked: $SYMLINK_PATH -> $PLUGIN_SRC"

echo ""
echo "Plugin installed. Start OpenCode to load it."
echo ""
echo "For local dev, set VI_CLI_PATH:"
echo "  export VI_CLI_PATH=\"bun $REPO_ROOT/packages/cli/src/index.ts\""
echo ""
echo "Watch logs:"
echo "  tail -f /tmp/agentlogs-opencode.log"
