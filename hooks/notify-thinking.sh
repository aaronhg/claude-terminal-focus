#!/bin/bash
INPUT=$(cat)

CLAUDE_PID=$PPID
TERMINAL_SHELL_PID=$(ps -o ppid= -p "$CLAUDE_PID" | tr -d ' ')

jq -n --arg pid "$TERMINAL_SHELL_PID" '{"pid": $pid, "type": "thinking"}' > "$HOME/.claude/hooks/.focus-thinking"
