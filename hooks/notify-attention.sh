#!/bin/bash
INPUT=$(cat)
MSG=$(echo "$INPUT" | jq -r '.message // "Needs your attention"' | head -c 200 | sed 's/[\"\\]/./g')
TITLE=$(echo "$INPUT" | jq -r '.title // "Claude Code"' | sed 's/[\"\\]/./g')

CLAUDE_PID=$PPID
TERMINAL_SHELL_PID=$(ps -o ppid= -p "$CLAUDE_PID" | tr -d ' ')

jq -n --arg pid "$TERMINAL_SHELL_PID" --arg msg "$MSG" --arg title "$TITLE" --arg sound "Ping" \
  '{pid: $pid, message: $msg, title: $title, sound: $sound}' > "$HOME/.claude/hooks/.focus-pending"

source "$(dirname "$0")/_upsert-state.sh" "attention" "$MSG"
