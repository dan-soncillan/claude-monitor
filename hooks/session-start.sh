#!/usr/bin/env bash
# Hook: SessionStart - Called when a Claude Code session starts
source "$(dirname "$0")/common.sh"

read_input
SESSION_ID=$(get_session_id)
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd // ""')
MODEL=$(echo "$HOOK_INPUT" | jq -r '.model // ""')

send_event "$(jq -n \
  --arg sid "$SESSION_ID" \
  --arg cwd "$CWD" \
  --arg model "$MODEL" \
  '{
    session_id: $sid,
    event_type: "session_start",
    tool_input: { cwd: $cwd, model: $model }
  }')"
