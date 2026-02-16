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

# --- Part 2: Display monthly cost (existing behavior) ---
USD=$(npx ccusage@16.2.0 monthly --json --order desc 2>/dev/null | jq -r '.monthly[0].totalCost')
if [ -z "$USD" ] || [ "$USD" = "null" ]; then
  echo "💰 ¥-- monthly"
  exit 0
fi

# Get USD/JPY rate (cached for 6 hours)
CACHE_FILE="$HOME/.claude/.usd_jpy_rate"
RATE=""
if [ -f "$CACHE_FILE" ]; then
  CACHE_AGE=$(( $(date +%s) - $(stat -f %m "$CACHE_FILE") ))
  if [ "$CACHE_AGE" -lt 21600 ]; then
    RATE=$(cat "$CACHE_FILE")
  fi
fi
if [ -z "$RATE" ]; then
  RATE=$(curl -s "https://api.exchangerate-api.com/v4/latest/USD" | jq -r '.rates.JPY // empty' 2>/dev/null)
  if [ -n "$RATE" ]; then
    echo "$RATE" > "$CACHE_FILE"
  else
    RATE=150
  fi
fi

# Calculate JPY (rounded to integer)
JPY=$(echo "$USD * $RATE" | bc 2>/dev/null | cut -d. -f1)
if [ -z "$JPY" ]; then
  JPY=$(jq -n "$USD * $RATE | round")
fi

JPY_FMT=$(printf "%'d" "$JPY" 2>/dev/null || echo "$JPY")
echo "💰 ¥${JPY_FMT} monthly"
