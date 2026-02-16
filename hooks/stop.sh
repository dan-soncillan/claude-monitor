#!/usr/bin/env bash
# Hook: Stop - Called when Claude Code is about to stop
source "$(dirname "$0")/common.sh"

read_input
SESSION_ID=$(get_session_id)
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd // ""')
STOP_REASON=$(echo "$HOOK_INPUT" | jq -r '.stop_reason // "end_turn"')

# Extract the last assistant text response from the transcript file
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // ""')
RESPONSE=""
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Brief delay to ensure transcript is fully flushed to disk
  sleep 0.3

  # Guard: skip processing if transcript is too large (>5MB) to prevent OOM
  FILE_SIZE=$(stat -f%z "$TRANSCRIPT_PATH" 2>/dev/null || echo 0)
  MAX_SIZE=$((5 * 1024 * 1024))

  if [ "$FILE_SIZE" -gt "$MAX_SIZE" ]; then
    RESPONSE="[Transcript too large to process: ${FILE_SIZE} bytes]"
  else
    # Stream-process JSONL line by line (no jq -s slurp) to avoid loading
    # the entire file into memory. Read last 2000 lines in reverse order
    # and return the first (= most recent) assistant text entry.
    RESPONSE=$(tail -2000 "$TRANSCRIPT_PATH" \
      | tail -r \
      | while IFS= read -r line; do
          result=$(echo "$line" | jq -r '
            select(.type == "assistant" and .message.role == "assistant") |
            select(any(.message.content[]?; .type == "text" and (.text | length) > 0)) |
            [.message.content[]? | select(.type == "text") | .text] |
            join("\n")
          ' 2>/dev/null)
          if [ -n "$result" ]; then
            echo "$result"
            break
          fi
        done \
      | head -c 50000)
  fi
fi

# stop must be synchronous to guarantee ordering before user_prompt
send_event "$(jq -n \
  --arg sid "$SESSION_ID" \
  --arg cwd "$CWD" \
  --arg reason "$STOP_REASON" \
  --arg response "$RESPONSE" \
  '{
    session_id: $sid,
    event_type: "stop",
    tool_name: $reason,
    summary: (if $response != "" then $response else ("Stopped: " + $reason) end),
    cwd: $cwd
  }')"
