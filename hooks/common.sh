#!/usr/bin/env bash
# Common utilities for Claude Code hooks
# Source this file from other hooks: source "$(dirname "$0")/common.sh"

MONITOR_URL="${CLAUDE_MONITOR_URL:-http://localhost:4001}"

# Limit virtual memory for child processes (jq, curl, etc.) to prevent OOM.
# Default: 512MB. Override with HOOK_MEMORY_LIMIT_MB env var.
HOOK_MEMORY_LIMIT_MB="${HOOK_MEMORY_LIMIT_MB:-512}"
ulimit -v $(( HOOK_MEMORY_LIMIT_MB * 1024 )) 2>/dev/null || true

# Read JSON input from stdin and store in HOOK_INPUT
read_input() {
  HOOK_INPUT=$(cat)
}

# Extract session_id from hook input
get_session_id() {
  echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"'
}

# Send event to ClaudeMonitor backend
send_event() {
  local payload="$1"

  curl -s -X POST "${MONITOR_URL}/api/events" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --connect-timeout 1 --max-time 3 2>/dev/null || true
}

# Send event in background (non-blocking, for hooks that don't need the response)
send_event_async() {
  local payload="$1"

  curl -s -X POST "${MONITOR_URL}/api/events" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --connect-timeout 1 --max-time 3 2>/dev/null &

  # Reap any finished background jobs to prevent zombie process accumulation
  wait -n 2>/dev/null || true
}
