#!/usr/bin/env bash
#
# Check Vibe Insights Plugin Development Mode Status
#
# This script displays the current plugin mode (local development or production)
# and validates that the CLI is accessible and working correctly.
#
# Usage: npm run plugin:status
#

echo "📊 Vibe Insights Plugin Status"
echo "==============================="
echo

if [ -n "$VI_CLI_PATH" ]; then
  echo "🔧 Mode: LOCAL DEVELOPMENT"
  echo
  echo "Configuration:"
  echo "  VI_CLI_PATH=$VI_CLI_PATH"
  echo "  VI_SERVER_URL=${VI_SERVER_URL:-<not set>}"
  echo "  VI_API_TOKEN=${VI_API_TOKEN:+<set>}${VI_API_TOKEN:-<not set>}"
  echo
  echo "Testing CLI access:"
  # Test with empty stdin - CLI should exit with warning about empty stdin
  if echo "" | eval "$VI_CLI_PATH" claudecode hook 2>&1 | grep -q "empty stdin"; then
    echo "  ✅ CLI accessible and working"
  else
    echo "  ❌ CLI not accessible at: $VI_CLI_PATH"
    exit 1
  fi
else
  echo "🚀 Mode: PRODUCTION"
  echo
  echo "Configuration:"
  echo "  CLI: npx -y @vibeinsights/cli@latest"
  echo
  echo "Testing npx access:"
  # Status command may exit non-zero if not logged in, but that's ok
  if npx -y @vibeinsights/cli@latest status 2>&1 | grep -q "logged in\|Not logged in"; then
    echo "  ✅ CLI accessible via npx"
  else
    echo "  ⚠️  npx access check failed"
  fi
fi

echo
echo "Next steps:"
if [ -n "$VI_CLI_PATH" ]; then
  echo "  • Switch to production: npm run plugin:switch-prod"
  echo "  • Ensure local server is running: npm run dev"
else
  echo "  • Switch to local dev: npm run plugin:switch-dev"
fi
