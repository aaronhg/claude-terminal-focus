#!/bin/bash
set -e

CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
EXT_DIR="$HOME/.vscode/extensions/claude-terminal-focus"
SETTINGS="$CLAUDE_DIR/settings.json"

# Remove hook scripts
rm -f "$HOOKS_DIR/notify-stop.sh" "$HOOKS_DIR/notify-attention.sh"
rm -f "$HOOKS_DIR/.focus-pending" "$HOOKS_DIR/.focus-signal"
echo "✓ Hook scripts removed"

# Remove VSCode extension symlink
rm -f "$EXT_DIR"
echo "✓ VSCode extension removed"

# Remove hooks from settings.json
if [ -f "$SETTINGS" ] && command -v jq &>/dev/null; then
  jq 'del(.hooks.Stop, .hooks.Notification) | if .hooks == {} then del(.hooks) else . end' "$SETTINGS" > "$SETTINGS.tmp"
  mv "$SETTINGS.tmp" "$SETTINGS"
  echo "✓ Hooks removed from $SETTINGS"
fi

echo ""
echo "Done. Reload VSCode: Cmd+Shift+P → Reload Window"
