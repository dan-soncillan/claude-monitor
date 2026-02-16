#!/usr/bin/env bash
# Hook: SessionEnd - Called when a Claude Code session ends
source "$(dirname "$0")/common.sh"

read_input
SESSION_ID=$(get_session_id)
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd // ""')

send_event "$(jq -n \
  --arg sid "$SESSION_ID" \
  --arg cwd "$CWD" \
  '{
    session_id: $sid,
    event_type: "session_end",
    cwd: $cwd
  }')"
