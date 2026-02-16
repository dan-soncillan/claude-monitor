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

# Detect terminal multiplexer (tmux, screen, wezterm) and extract session info
get_terminal_info() {
  local terminal_type=""
  local session_id=""

  # Check for tmux
  if [ -n "$TMUX" ]; then
    terminal_type="tmux"
    # Extract session name from TMUX env var (format: /tmp/tmux-UID/session_name,pane_id,window_id)
    # The session name is the part after the last / and before the first comma
    session_id=$(echo "$TMUX" | sed -E 's|.*tmux-[^/]+/([^,]+).*|\1|' || echo "")
    # If extraction fails, try tmux command
    if [ -z "$session_id" ]; then
      session_id=$(tmux display-message -p '#S' 2>/dev/null || echo "")
    fi
  # Check for screen
  elif [ -n "$STY" ]; then
    terminal_type="screen"
    session_id="$STY"
  # Check for WezTerm (via environment variable or process name)
  elif [ -n "$TERM_PROGRAM" ] && [ "$TERM_PROGRAM" = "WezTerm" ]; then
    terminal_type="wezterm"
    # WezTerm doesn't have a standard session ID in env vars
    session_id=""
  fi

  # Return JSON object
  if [ -n "$terminal_type" ] && [ -n "$session_id" ]; then
    jq -n \
      --arg type "$terminal_type" \
      --arg session_id "$session_id" \
      '{type: $type, session_id: $session_id}'
  else
    # Return null if no terminal multiplexer detected
    echo "null"
  fi
}
