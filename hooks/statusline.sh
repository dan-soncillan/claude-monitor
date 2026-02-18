#!/bin/bash
# Status line script for Claude Code
# 1. POSTs per-session cost data to ClaudeMonitor server (background, non-blocking)
# 2. Displays monthly cost in terminal status bar

MONITOR_URL="${CLAUDE_MONITOR_URL:-http://localhost:4001}"

# Read JSON from stdin (Claude Code pipes status data here)
input=$(cat)

# --- Part 1: POST session cost to monitor (background, non-blocking) ---
SESSION_ID=$(echo "$input" | jq -r '.session_id // empty')
COST_USD=$(echo "$input" | jq -r '.cost.total_cost_usd // empty')

if [ -n "$SESSION_ID" ] && [ -n "$COST_USD" ]; then
  PAYLOAD=$(echo "$input" | jq -c '{
    cost_usd: .cost.total_cost_usd,
    cost_duration_ms: (.cost.total_duration_ms // null),
    cost_api_duration_ms: (.cost.total_api_duration_ms // null),
    total_input_tokens: (.context_window.total_input_tokens // null),
    total_output_tokens: (.context_window.total_output_tokens // null),
    context_used_pct: (.context_window.used_percentage // null)
  }')

  curl -s -X PUT "${MONITOR_URL}/api/sessions/${SESSION_ID}/cost" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --connect-timeout 1 --max-time 2 2>/dev/null &
fi

# --- Part 2: Display monthly cost (DISABLED to avoid API cost spike) ---
# Disabled ccusage call - was calling Anthropic API on every prompt, causing invoice spike
# To check costs, run: npx ccusage@16.2.0 monthly
echo "💰 ¥-- monthly"
