#!/usr/bin/env bash
# Hook: UserPromptSubmit - Called when user submits a prompt
source "$(dirname "$0")/common.sh"

read_input
SESSION_ID=$(get_session_id)
PROMPT=$(echo "$HOOK_INPUT" | jq -r '.prompt // ""')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd // ""')

send_event_async "$(jq -n \
  --arg sid "$SESSION_ID" \
  --arg prompt "$PROMPT" \
  --arg cwd "$CWD" \
  '{
    session_id: $sid,
    event_type: "user_prompt",
    summary: $prompt,
    cwd: $cwd
  }')"
