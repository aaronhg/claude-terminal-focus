#!/bin/bash
set -e

PLIST_LABEL="com.aaron.claude-menubar"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

# Stop existing instance (ignore errors if not running)
launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
sleep 1
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || {
  sleep 2
  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
}
echo "Menubar app started."
