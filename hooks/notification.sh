#!/usr/bin/env bash
# Hook: Notification - Called when Claude Code sends a notification
source "$(dirname "$0")/common.sh"

read_input
SESSION_ID=$(get_session_id)
MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.message // ""')
NTYPE=$(echo "$HOOK_INPUT" | jq -r '.notification_type // ""')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd // ""')

send_event_async "$(jq -n \
  --arg sid "$SESSION_ID" \
  --arg msg "$MESSAGE" \
  --arg nt "$NTYPE" \
  --arg cwd "$CWD" \
  '{
    session_id: $sid,
    event_type: "notification",
    summary: $msg,
    tool_name: $nt,
    cwd: $cwd
  }')"
