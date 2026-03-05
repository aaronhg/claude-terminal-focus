# Claude Terminal Focus

Native macOS notifications for Claude Code — click to jump to the right VSCode terminal tab.

## What it does

When Claude Code finishes a response or needs your input, you get a macOS notification. Click it to focus the exact terminal tab, even with multiple Claude Code sessions open.

- **Finish notification** — shows a summary of Claude's last response
- **Permission notification** — shows what Claude is waiting for
- **● tab marker** — unread terminals get a `●` prefix, cleared when you switch to them
- **Smart skip** — no notification if you're already looking at that terminal
- **Precise matching** — uses shell process ID to distinguish multiple sessions

## Requirements

- macOS
- VSCode
- Claude Code

## Install

```bash
brew install jq terminal-notifier
git clone <this-repo> && cd claude-terminal-focus
./install.sh
```

Then reload VSCode: `Cmd+Shift+P` → `Reload Window`.

## Uninstall

```bash
./uninstall.sh
```

## How it works

```
Claude Code stops
  → Hook writes a JSON signal file (PID + message)
  → VSCode extension reads it
  → Is that terminal currently focused?
    → Yes → do nothing
    → No  → send macOS notification + add ● marker to tab name
  → User clicks notification
    → Focus the correct terminal + clear ● marker
```

The hook script discovers the terminal's shell PID by walking up the process tree (hook → claude → shell). The VSCode extension matches this PID against `terminal.processId` to find the right tab.

## What gets installed

| Component | Location |
|-----------|----------|
| Hook scripts | `~/.claude/hooks/notify-stop.sh`, `notify-attention.sh` |
| VSCode extension | `~/.vscode/extensions/claude-terminal-focus` (symlink) |
| Hook config | Merged into `~/.claude/settings.json` |

## License

MIT
