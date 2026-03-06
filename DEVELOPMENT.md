# Development Context

This tool was built in a single conversation with Claude Code, iterating through real usage problems as they appeared.

## Starting point

The problem: Claude Code runs tasks that take time. When it finishes or needs input, there's no way to know unless you're staring at the terminal. On macOS, we wanted native notifications.

## Iteration timeline

### 1. Basic notification

Started with the simplest approach — a Stop hook calling `osascript display notification`. Worked immediately, but the first real message broke it: AppleScript choked on double quotes in `last_assistant_message`. Fixed with `sed` to sanitize special characters.

### 2. Click-to-focus problem

`display notification` has no click handler. Clicking a macOS notification does nothing. Switched to `terminal-notifier` which supports `-execute` — run a command when the notification is clicked.

### 3. Which terminal?

Clicking the notification should focus the right VSCode terminal tab. VSCode has no URI scheme or CLI for this. The only path: build a VSCode extension.

### 4. Terminal identification

Three Claude Code sessions open, all named `2.1.69`, all in the same `cwd`. Can't match by name. Can't match by directory.

Found the answer in the process tree:
```
zsh (terminal shell, PID 74109)  ← VSCode terminal.processId
  └── claude (PID 95314)
      └── hook script (PID 42966)
```

The hook script walks up two levels (`$PPID` → parent's `$PPID`) to get the terminal shell PID. The extension matches it against `terminal.processId`. Works even with identical terminal names.

### 5. Signal file protocol

Hook scripts can't talk to VSCode extensions directly. Solution: file-based signaling.

- Hook writes `.focus-pending` (JSON with PID + message)
- Extension watches with `FileSystemWatcher`
- Extension reads, processes, deletes

On notification click, `terminal-notifier -execute` writes `.focus-signal` with the PID. Extension picks it up and calls `terminal.show()`.

### 6. Tab marker (●)

Wanted a visual indicator for terminals with unread notifications. VSCode Terminal API has readonly `name` — no setter. Workaround: `workbench.action.terminal.renameWithArg` command, which renames the active terminal.

This created two sub-problems:
- **Must be active to rename**: Need `terminal.show(false)` to make it active, rename, then switch back. Causes brief flicker.
- **Race condition**: Switching to rename triggers `onDidChangeActiveTerminal`, which immediately clears the marker. Fixed with a `renaming` flag to suppress the handler during rename operations.

### 7. Smart skip

If you're already looking at the terminal, no notification needed. Moved `terminal-notifier` call from hook script into the extension, which checks `vscode.window.activeTerminal === targetTerminal` before deciding to notify.

This changed the architecture: hook scripts only write a JSON signal file. The extension handles all notification logic.

### 8. Packaging

Extracted from scattered files in `~/.claude/` into a self-contained directory with `install.sh` and `uninstall.sh`. Install script uses `jq` to merge hooks into existing `settings.json` without overwriting other settings.

### 9. Security review

- **Shell injection**: `exec()` with string concatenation → `execFile()` with argument array
- **Path portability**: hardcoded `/opt/homebrew/bin/terminal-notifier` → dynamic `which` lookup (supports both Apple Silicon and Intel)
- **Duplicate install**: added detection + confirmation prompt when overwriting existing hooks

## Architecture

```
Hook script (runs in Claude Code process)
  │
  ├─▶ writes .focus-pending / .focus-thinking (per-window signal)
  │     │
  │     ▼ FileSystemWatcher
  │   VSCode extension
  │     ├─ activeTerminal? → skip
  │     ├─ execFile terminal-notifier
  │     │    └─ on click → writes .focus-signal
  │     └─ rename terminal: "● 2.1.69"
  │          └─ onDidChangeActiveTerminal → rename back
  │
  └─▶ upserts .focus-state.json (shared across all sessions)
        │
        ▼ fs.watch + 3s poll
      Menubar app (Electron)
        ├─ tray badge: count of done/attention sessions
        ├─ click item → writes .focus-signal → extension focuses terminal
        └─ swipe left → removes from state.json
```

### 10. Menubar app (global session overview)

With multiple VSCode windows running Claude Code simultaneously, there was no single place to see all sessions. VSCode extension API can't access terminals across windows.

Built an Electron menubar app using the `menubar` npm package:
- Hook scripts upsert a shared `~/.claude/hooks/.focus-state.json` with session state (thinking/done/attention)
- Menubar app watches the state file + polls every 3s (macOS `fs.watch` is unreliable with atomic `mv` writes)
- Renderer uses `nodeIntegration: true` + `sandbox: false` for direct `fs` access, bypassing IPC entirely
- Click item → writes `.focus-signal` → VSCode extension picks it up and focuses the correct window + terminal
- Swipe left to dismiss (trackpad two-finger gesture via `wheel` event, threshold at half-width)
- Tray badge shows count of sessions needing attention

Key iteration: IPC between main and renderer was unreliable with the `menubar` package (popup blur racing with click events). Switching to direct `require('fs')` in the renderer eliminated the entire IPC layer.

### 11. Shell hook deduplication

The three hook scripts shared ~80% identical code for upserting `_focus-state.json`. Extracted to `_upsert-state.sh` sourced by each hook, reducing each to its unique signal file logic + a one-line `source` call.

### 12. LaunchAgent management

Previously the menubar app required manual `cd menubar-app && npm start`. Added macOS LaunchAgent integration:

- `install.sh` dynamically generates a plist at `~/Library/LaunchAgents/com.aaron.claude-menubar.plist` with resolved paths (supports nvm by detecting `$(which node)` directory)
- `RunAtLoad: true` for login auto-start, `KeepAlive: false` so manual stop stays stopped
- `start.sh` / `stop.sh` wrappers around `launchctl bootstrap` / `bootout` (modern API, not deprecated `load`/`unload`)
- `uninstall.sh` cleans up the plist

Key iteration: the electron shim at `node_modules/.bin/electron` (a symlink to `cli.js`) fails with EPERM under LaunchAgent's restricted environment. Fix: point `ProgramArguments` directly at `electron/dist/Electron.app/Contents/MacOS/Electron`.

## Key decisions

| Decision | Why |
|----------|-----|
| File-based signaling, not HTTP | No server to manage, works offline, zero dependencies |
| PID matching, not name/cwd | Only reliable way to distinguish identical terminals |
| Notification logic in extension, not hook | Extension knows which terminal is active; hook doesn't |
| `execFile` over `exec` | Prevents shell injection from message content |
| `jq` for settings merge | Preserves existing user settings, no manual JSON editing |
| Direct `fs` in renderer, no IPC | `menubar` popup blur races with click events; direct fs eliminates the problem |
| `fs.watch` + 3s polling | macOS `fs.watch` misses atomic `mv` writes; polling ensures consistency |
| Shared `_upsert-state.sh` | Eliminates duplicated jq upsert logic across 3 hook scripts |
| Atomic file writes (`tmp` + `mv`) | Prevents readers from seeing partial JSON |
| LaunchAgent, not login item | `launchctl bootstrap/bootout` gives precise start/stop control; `RunAtLoad` for login auto-start |
| Direct Electron binary in plist | `node_modules/.bin/electron` shim gets EPERM under LaunchAgent |
