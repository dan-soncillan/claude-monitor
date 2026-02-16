#!/usr/bin/env bash
# Hook: PreToolUse - Called before a tool execution
# Sends event to ClaudeMonitor and polls for approval if needed.
# Output JSON with hookSpecificOutput for permission decisions.
source "$(dirname "$0")/common.sh"

read_input
SESSION_ID=$(get_session_id)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$HOOK_INPUT" | jq -c '.tool_input // {}')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd // ""')

# Send pre_tool_use event and check if approval is needed
RESPONSE=$(curl -s -X POST "${MONITOR_URL}/api/events" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg sid "$SESSION_ID" \
    --arg tn "$TOOL_NAME" \
    --argjson ti "$TOOL_INPUT" \
    --arg cwd "$CWD" \
    '{
      session_id: $sid,
      event_type: "pre_tool_use",
      tool_name: $tn,
      tool_input: $ti,
      cwd: $cwd
    }')" \
  --connect-timeout 2 --max-time 5 2>/dev/null)

# If server is unreachable (empty response), allow by default (monitor is optional)
if [ -z "$RESPONSE" ]; then
  exit 0
fi

# Check if an approval was created
APPROVAL_ID=$(echo "$RESPONSE" | jq -r '.approval.id // empty' 2>/dev/null)

if [ -z "$APPROVAL_ID" ] || [ "$APPROVAL_ID" = "null" ]; then
  # No approval needed - allow
  exit 0
fi

# Check immediate auto-deny
APPROVAL_STATUS=$(echo "$RESPONSE" | jq -r '.approval.status // empty')
if [ "$APPROVAL_STATUS" = "rejected" ]; then
  echo "Blocked by approval rule" >&2
  exit 2
fi

# Poll for approval decision (max 10 minutes, 1 second interval)
MAX_WAIT=600
WAITED=0
CONSECUTIVE_FAILURES=0
MAX_CONSECUTIVE_FAILURES=30

while [ $WAITED -lt $MAX_WAIT ]; do
  sleep 1
  WAITED=$((WAITED + 1))

  POLL_RESPONSE=$(curl -s "${MONITOR_URL}/api/approvals/${APPROVAL_ID}" --connect-timeout 2 --max-time 5 2>/dev/null)
  STATUS=$(echo "$POLL_RESPONSE" | jq -r '.status // empty')

  case "$STATUS" in
    approved)
      exit 0
      ;;
    rejected)
      REASON=$(echo "$POLL_RESPONSE" | jq -r '.decision_reason // "Rejected by user"')
      echo "$REASON" >&2
      exit 2
      ;;
    timeout)
      echo "Approval timed out" >&2
      exit 2
      ;;
    pending)
      CONSECUTIVE_FAILURES=0
      continue
      ;;
    "")
      # Empty response (server unreachable) - count consecutive failures
      CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
      if [ $CONSECUTIVE_FAILURES -ge $MAX_CONSECUTIVE_FAILURES ]; then
        echo "Server unreachable for ${MAX_CONSECUTIVE_FAILURES}s, allowing by default" >&2
        exit 0
      fi
      continue
      ;;
    *)
      # Unknown status - count as failure
      CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
      if [ $CONSECUTIVE_FAILURES -ge $MAX_CONSECUTIVE_FAILURES ]; then
        echo "Unexpected polling responses for ${MAX_CONSECUTIVE_FAILURES}s, allowing by default" >&2
        exit 0
      fi
      continue
      ;;
  esac
done

# Timeout: update approval status and deny
curl -s -X PUT "${MONITOR_URL}/api/approvals/${APPROVAL_ID}" \
  -H "Content-Type: application/json" \
  -d '{"status": "rejected", "decided_by": "timeout", "decision_reason": "Approval timed out after 10 minutes"}' \
  --max-time 5 2>/dev/null || true

echo "Approval timed out after 10 minutes" >&2
exit 2
