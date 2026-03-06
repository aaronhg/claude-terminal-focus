#!/bin/bash
set -e

# Check dependencies
missing=()
for cmd in jq terminal-notifier; do
  if ! command -v "$cmd" &>/dev/null; then
    missing+=("$cmd")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing dependencies: ${missing[*]}"
  echo "Install with: brew install ${missing[*]}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
EXT_DIR="$HOME/.vscode/extensions/claude-terminal-focus"
SETTINGS="$CLAUDE_DIR/settings.json"

# Install hook scripts
mkdir -p "$HOOKS_DIR"
cp "$SCRIPT_DIR/hooks/notify-stop.sh" "$HOOKS_DIR/"
cp "$SCRIPT_DIR/hooks/notify-attention.sh" "$HOOKS_DIR/"
cp "$SCRIPT_DIR/hooks/notify-thinking.sh" "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR/notify-stop.sh" "$HOOKS_DIR/notify-attention.sh" "$HOOKS_DIR/notify-thinking.sh"
echo "✓ Hook scripts installed to $HOOKS_DIR"

# Install VSCode extension via symlink
ln -sf "$SCRIPT_DIR/vscode-extension" "$EXT_DIR"
echo "✓ VSCode extension linked at $EXT_DIR"

# Merge hooks into settings.json
HOOKS_JSON=$(jq -n \
  --arg stop "$HOOKS_DIR/notify-stop.sh" \
  --arg attn "$HOOKS_DIR/notify-attention.sh" \
  --arg think "$HOOKS_DIR/notify-thinking.sh" \
  '{
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": $think}]}],
    "Stop": [{"hooks": [{"type": "command", "command": $stop}]}],
    "Notification": [{"matcher": "permission_prompt", "hooks": [{"type": "command", "command": $attn}]}]
  }')

mkdir -p "$CLAUDE_DIR"
if [ -f "$SETTINGS" ]; then
  # Warn if Stop or Notification hooks already exist
  EXISTING=$(jq -r '.hooks // {} | keys[]' "$SETTINGS" 2>/dev/null || true)
  CONFLICT=""
  for key in UserPromptSubmit Stop Notification; do
    if echo "$EXISTING" | grep -qx "$key"; then
      CONFLICT="$CONFLICT $key"
    fi
  done
  if [ -n "$CONFLICT" ]; then
    echo "⚠ Existing hooks will be overwritten:$CONFLICT"
    read -p "  Continue? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted. Hook config was not changed."
      exit 0
    fi
  fi
  jq --argjson newHooks "$HOOKS_JSON" '.hooks = ((.hooks // {}) + $newHooks)' "$SETTINGS" > "$SETTINGS.tmp"
  mv "$SETTINGS.tmp" "$SETTINGS"
else
  jq -n --argjson hooks "$HOOKS_JSON" '{hooks: $hooks}' > "$SETTINGS"
fi
echo "✓ Hooks merged into $SETTINGS"

# Install menubar app dependencies
if [ -d "$SCRIPT_DIR/menubar-app" ]; then
  echo "Installing menubar app dependencies..."
  (cd "$SCRIPT_DIR/menubar-app" && npm install)
  echo "✓ Menubar app ready (run: cd $SCRIPT_DIR/menubar-app && npm start)"
fi

echo ""
echo "Done. Reload VSCode: Cmd+Shift+P → Reload Window"
