#!/usr/bin/env bash
# Install ClaudeMonitor hooks into Claude Code settings
# Usage: ./scripts/install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PROJECT_DIR/hooks"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "ClaudeMonitor Hook Installer"
echo "============================"
echo ""
echo "Hooks directory: $HOOKS_DIR"
echo "Settings file:   $SETTINGS_FILE"
echo ""

# Make hook scripts executable
chmod +x "$HOOKS_DIR"/*.sh

# Generate hooks settings
HOOKS_JSON=$("$SCRIPT_DIR/generate-settings.sh" "$HOOKS_DIR")

# Check if settings file exists
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "Creating new settings file..."
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  echo "$HOOKS_JSON" > "$SETTINGS_FILE"
  echo "Settings created successfully."
else
  echo "Existing settings file found."
  echo ""

  # Check if hooks are already configured
  if jq -e '.hooks' "$SETTINGS_FILE" > /dev/null 2>&1; then
    echo "WARNING: Existing hooks configuration found in settings."
    echo "The new hooks will be merged with existing ones."
    echo ""
    read -p "Continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted. You can manually merge the hooks from:"
      echo "  $SCRIPT_DIR/generate-settings.sh"
      exit 1
    fi
  fi

  # Merge hooks into existing settings
  MERGED=$(jq -s '.[0] * .[1]' "$SETTINGS_FILE" <(echo "$HOOKS_JSON"))
  echo "$MERGED" > "$SETTINGS_FILE"
  echo "Settings updated successfully."
fi

echo ""
echo "Installation complete!"
echo ""
echo "Make sure the ClaudeMonitor server is running:"
echo "  cd $PROJECT_DIR && bun run dev:server"
echo ""
echo "Then start Claude Code in any project to begin monitoring."
