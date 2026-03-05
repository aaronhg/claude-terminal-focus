#!/bin/bash
INPUT=$(cat)
MSG=$(echo "$INPUT" | jq -r '.last_assistant_message // "done"' | head -c 200 | sed 's/[\"\\]/./g')

CLAUDE_PID=$PPID
TERMINAL_SHELL_PID=$(ps -o ppid= -p "$CLAUDE_PID" | tr -d ' ')

jq -n --arg pid "$TERMINAL_SHELL_PID" --arg msg "$MSG" --arg title "Claude Code" --arg sound "Glass" \
  '{pid: $pid, message: $msg, title: $title, sound: $sound}' > "$HOME/.claude/hooks/.focus-pending"
