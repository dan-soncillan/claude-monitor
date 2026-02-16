#!/usr/bin/env bash
# Start ClaudeMonitor in development mode
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "Starting ClaudeMonitor development servers..."
echo ""

# Run server and web in parallel using turbo
bun run dev
