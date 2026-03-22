#!/bin/bash
set -e

CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
EXT_DIR="$HOME/.vscode/extensions/claude-terminal-focus"
SETTINGS="$CLAUDE_DIR/settings.json"

# Remove hook scripts
rm -f "$HOOKS_DIR/notify-stop.sh" "$HOOKS_DIR/notify-attention.sh" "$HOOKS_DIR/notify-thinking.sh" "$HOOKS_DIR/_upsert-state.sh"
rm -f "$HOOKS_DIR/.focus-pending" "$HOOKS_DIR/.focus-signal" "$HOOKS_DIR/.focus-thinking" "$HOOKS_DIR/.focus-state.json"
echo "✓ Hook scripts removed"

# Remove VSCode extension
rm -rf "$EXT_DIR"
echo "✓ VSCode extension removed"

# Remove menubar app copy
rm -rf "$CLAUDE_DIR/menubar-app"
echo "✓ Menubar app removed"

# Remove hooks from settings.json
if [ -f "$SETTINGS" ] && command -v jq &>/dev/null; then
  jq 'del(.hooks.UserPromptSubmit, .hooks.Stop, .hooks.Notification) | if .hooks == {} then del(.hooks) else . end' "$SETTINGS" > "$SETTINGS.tmp"
  mv "$SETTINGS.tmp" "$SETTINGS"
  echo "✓ Hooks removed from $SETTINGS"
fi

# Remove LaunchAgent
PLIST_LABEL="com.claude-terminal-focus.menubar"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
rm -f "$PLIST_PATH"
echo "✓ LaunchAgent removed"

echo ""
echo "Done. Reload VSCode: Cmd+Shift+P → Reload Window"
