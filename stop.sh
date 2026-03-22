#!/bin/bash
set -e

PLIST_LABEL="com.claude-terminal-focus.menubar"

launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
echo "Menubar app stopped."
