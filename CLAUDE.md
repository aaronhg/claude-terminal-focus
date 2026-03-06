# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A macOS notification system for Claude Code. When Claude finishes a task or needs permission, it sends a native macOS notification. Clicking the notification focuses the correct VSCode terminal tab. A menubar app provides a global overview of all sessions across VSCode windows.

No build step, no tests, no linter. Dependencies: `jq`, `terminal-notifier` (both via Homebrew).

## Architecture

Three components communicate via JSON files in `~/.claude/hooks/`:

```
Hook scripts (bash, run by Claude Code process)
  |
  +-> .focus-thinking / .focus-pending   (per-event signal files)
  |     |
  |     v  FileSystemWatcher
  |   VSCode extension (extension.js)
  |     +- checks if terminal is active -> skip notification
  |     +- execFile terminal-notifier -> click writes .focus-signal
  |     +- renames terminal tab with marker
  |
  +-> .focus-state.json  (shared session state, all sessions)
        |
        v  fs.watch + 3s polling
      Menubar app (Electron)
        +- tray badge count
        +- click -> writes .focus-signal -> extension focuses terminal
        +- swipe left -> dismisses from state
```

**Terminal identification**: Hook scripts walk the process tree (`$PPID` -> parent's PPID) to find the terminal shell PID. The VSCode extension matches this against `terminal.processId`. This is the only reliable way to distinguish multiple Claude Code sessions.

**File-based signaling**: Hooks can't talk to VSCode extensions directly. All communication is via JSON files with atomic writes (`tmp` + `mv`).

## Project Structure

| Path | Purpose |
|------|---------|
| `hooks/notify-stop.sh` | Stop hook - Claude finished, writes `.focus-pending` |
| `hooks/notify-attention.sh` | Notification hook (permission_prompt) - writes `.focus-pending` |
| `hooks/notify-thinking.sh` | UserPromptSubmit hook - writes `.focus-thinking` |
| `hooks/_upsert-state.sh` | Shared helper sourced by all hooks to update `.focus-state.json` |
| `vscode-extension/extension.js` | VSCode extension - watches signal files, manages tab markers, sends notifications |
| `vscode-extension/package.json` | Extension manifest (activates onStartupFinished) |
| `menubar-app/main.js` | Electron main process - tray icon, badge count |
| `menubar-app/index.html` | Renderer - session list UI with swipe-to-dismiss |
| `install.sh` | Copies hooks, symlinks extension, merges settings.json, installs LaunchAgent, starts menubar app |
| `uninstall.sh` | Reverses install (including LaunchAgent removal) |
| `start.sh` | Restart menubar app (bootout + bootstrap) |
| `stop.sh` | Stop menubar app (bootout) |

## Key Design Decisions

- **Notification logic lives in the extension**, not hooks. Only the extension knows which terminal is currently active (smart skip).
- **`execFile` not `exec`** for `terminal-notifier` to prevent shell injection from message content.
- **Terminal rename uses `workbench.action.terminal.renameWithArg`** command because `Terminal.name` is readonly. A `renaming` flag suppresses `onDidChangeActiveTerminal` during rename to prevent race conditions.
- **Menubar renderer uses `nodeIntegration: true` with direct `require('fs')`** instead of IPC. The `menubar` package's popup blur races with click events, making IPC unreliable.
- **`fs.watch` + 3s polling** because macOS `fs.watch` misses atomic `mv` writes.

## Running

```bash
./install.sh    # Install everything + start menubar app (auto-starts on login)
./start.sh      # Restart menubar app (after code changes)
./stop.sh       # Stop menubar app
./uninstall.sh  # Remove everything
```

The menubar app is managed via macOS LaunchAgent (`~/Library/LaunchAgents/com.aaron.claude-menubar.plist`). It starts automatically on login (`RunAtLoad`). Logs go to `/tmp/claude-menubar.log`.

After install/uninstall, reload VSCode: `Cmd+Shift+P` -> `Reload Window`.

## Editing Hooks

Hook scripts receive JSON on stdin from Claude Code. They extract fields with `jq`, walk the process tree for PID, then write signal files. All three hooks source `_upsert-state.sh` to update the shared state file.

When modifying hook output, remember that the extension parses the JSON from `.focus-pending` expecting `{pid, message, title, sound}`.
