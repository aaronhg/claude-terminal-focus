#!/bin/bash
# Usage: source _upsert-state.sh <state> <message>
# Requires: $TERMINAL_SHELL_PID set by caller

STATE="$1"
MESSAGE="$2"

STATE_FILE="$HOME/.claude/hooks/.focus-state.json"
CWD=$(pwd)
NOW=$(date +%s)
[ -f "$STATE_FILE" ] && CURRENT=$(cat "$STATE_FILE") || CURRENT="[]"
UPDATED=$(echo "$CURRENT" | jq --arg pid "$TERMINAL_SHELL_PID" --arg cwd "$CWD" --arg state "$STATE" --arg msg "$MESSAGE" --argjson ts "$NOW" \
  'if any(.[]; .pid == ($pid | tonumber)) then
     map(if .pid == ($pid | tonumber) then .state = $state | .message = $msg | .timestamp = $ts else . end)
   else
     . + [{"pid": ($pid | tonumber), "cwd": $cwd, "state": $state, "message": $msg, "timestamp": $ts}]
   end')
echo "$UPDATED" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
