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
cp "$SCRIPT_DIR/hooks/_upsert-state.sh" "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR/notify-stop.sh" "$HOOKS_DIR/notify-attention.sh" "$HOOKS_DIR/notify-thinking.sh" "$HOOKS_DIR/_upsert-state.sh"
echo "✓ Hook scripts installed to $HOOKS_DIR"

# Install VSCode extension via symlink
ln -sfn "$SCRIPT_DIR/vscode-extension" "$EXT_DIR"
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
  echo "✓ Menubar app dependencies installed"
fi

# Install LaunchAgent for menubar app
PLIST_LABEL="com.aaron.claude-menubar"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
ELECTRON_BIN="$SCRIPT_DIR/menubar-app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
APP_DIR="$SCRIPT_DIR/menubar-app"
NODE_BIN_DIR="$(dirname "$(which node)")"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ELECTRON_BIN</string>
    <string>$APP_DIR</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/claude-menubar.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/claude-menubar.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NODE_BIN_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST

echo "✓ LaunchAgent written to $PLIST_PATH"

# Stop old instance if running, then start
"$SCRIPT_DIR/start.sh"
echo "✓ Menubar app started"

echo ""
echo "Done. Reload VSCode: Cmd+Shift+P → Reload Window"
