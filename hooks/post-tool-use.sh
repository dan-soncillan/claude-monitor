#!/usr/bin/env bash
# Hook: PostToolUse - Called after a tool execution completes
source "$(dirname "$0")/common.sh"

read_input
SESSION_ID=$(get_session_id)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$HOOK_INPUT" | jq -c '.tool_input // {}')
TOOL_RESPONSE=$(echo "$HOOK_INPUT" | jq -c '.tool_response // {}')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd // ""')

send_event_async "$(jq -n \
  --arg sid "$SESSION_ID" \
  --arg tn "$TOOL_NAME" \
  --argjson ti "$TOOL_INPUT" \
  --argjson tr "$TOOL_RESPONSE" \
  --arg cwd "$CWD" \
  '{
    session_id: $sid,
    event_type: "post_tool_use",
    tool_name: $tn,
    tool_input: $ti,
    tool_response: $tr,
    cwd: $cwd
  }')"
