const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const SIGNAL_DIR = path.join(process.env.HOME, '.claude', 'hooks');
const THINKING_FILE = path.join(SIGNAL_DIR, '.focus-thinking');
const PENDING_FILE = path.join(SIGNAL_DIR, '.focus-pending');
const FOCUS_FILE = path.join(SIGNAL_DIR, '.focus-signal');
const STATE_FILE = path.join(SIGNAL_DIR, '.focus-state.json');
const MARKER_DONE = '● ';
const MARKER_THINKING = '▸ ';
const NOTIFIER = (() => {
  try { return execFileSync('which', ['terminal-notifier'], { encoding: 'utf8' }).trim(); }
  catch { return 'terminal-notifier'; }
})();

function ackStateFile(pid) {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')).map(s =>
      s.pid === pid && (s.state === 'done' || s.state === 'attention')
        ? { ...s, state: 'seen' } : s
    );
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch {}
}

// Map of terminal PID → { origName, state: 'thinking' | 'done' }
const tracked = new Map();
let renaming = false;
// Debounce: PID → timestamp of last notification
const lastNotified = new Map();

function activate(context) {
  const dir = vscode.Uri.file(SIGNAL_DIR);

  const thinkingWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(dir, '.focus-thinking')
  );
  const pendingWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(dir, '.focus-pending')
  );
  const focusWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(dir, '.focus-signal')
  );

  // User submitted prompt → mark terminal with ▸
  const onThinking = async () => {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(THINKING_FILE, 'utf8'));
    } catch { return; }

    const targetPid = parseInt(data.pid, 10);
    if (!targetPid) return;

    for (const t of vscode.window.terminals) {
      const pid = await t.processId;
      if (pid === targetPid) {
        if (vscode.window.activeTerminal === t) return;

        const entry = tracked.get(pid);
        if (entry && entry.state === 'thinking') return;

        const origName = entry ? entry.origName : t.name;
        tracked.set(pid, { origName, state: 'thinking' });
        await renameTo(t, MARKER_THINKING + origName);
        return;
      }
    }
  };

  // Claude finished / needs attention → mark terminal with ● and notify
  const onPending = async () => {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    } catch { return; }

    const targetPid = parseInt(data.pid, 10);
    if (!targetPid) return;

    for (const t of vscode.window.terminals) {
      const pid = await t.processId;
      if (pid === targetPid) {
        if (vscode.window.state.focused && vscode.window.activeTerminal === t) {
          // Clear thinking marker if present
          const entry = tracked.get(pid);
          if (entry) {
            tracked.delete(pid);
            await renameTo(t, entry.origName);
          }
          ackStateFile(targetPid);
          return;
        }

        // Debounce: suppress duplicate notifications within 2s
        const now = Date.now();
        const last = lastNotified.get(targetPid) || 0;
        if (now - last >= 2000) {
          lastNotified.set(targetPid, now);
          execFile(NOTIFIER, [
            '-title', data.title || 'Claude Code',
            '-message', data.message || 'done',
            '-sound', data.sound || 'Glass',
            '-execute', `echo ${targetPid} > '${FOCUS_FILE}'`
          ]);
        }

        const entry = tracked.get(pid);
        const origName = entry ? entry.origName : t.name;
        tracked.set(pid, { origName, state: 'done' });
        await renameTo(t, MARKER_DONE + origName);
        return;
      }
    }
  };

  // User clicks notification → focus terminal
  const onFocus = async () => {
    let targetPid = 0;
    try {
      targetPid = parseInt(fs.readFileSync(FOCUS_FILE, 'utf8').trim(), 10);
    } catch {}
    if (!targetPid) return;

    for (const t of vscode.window.terminals) {
      const pid = await t.processId;
      if (pid === targetPid) {
        try { fs.unlinkSync(FOCUS_FILE); } catch {}
        // Bring app to foreground + select correct window, then focus terminal
        const appName = vscode.env.appName || 'Visual Studio Code';
        execFile('osascript', ['-e', `tell application "${appName}" to activate`]);
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (folder) execFile('code', [folder]);
        t.show(false);
        await clearMarker(pid);
        ackStateFile(targetPid);
        return;
      }
    }
  };

  async function tryAckTerminal(t) {
    if (!t) return;
    const pid = await t.processId;
    if (tracked.has(pid)) {
      await clearMarker(pid);
      ackStateFile(pid);
    }
  }

  // Clear marker when user switches to a tracked terminal
  const onActiveChange = (t) => {
    if (renaming) return;
    tryAckTerminal(t);
  };

  // Window regains focus — clear marker on active terminal if tracked
  const onWindowState = (e) => {
    if (e.focused) tryAckTerminal(vscode.window.activeTerminal);
  };

  async function clearMarker(pid) {
    const entry = tracked.get(pid);
    if (!entry) return;
    tracked.delete(pid);
    await vscode.commands.executeCommand(
      'workbench.action.terminal.renameWithArg',
      { name: entry.origName }
    );
  }

  async function renameTo(terminal, name) {
    renaming = true;
    const prev = vscode.window.activeTerminal;
    terminal.show(false);
    await vscode.commands.executeCommand(
      'workbench.action.terminal.renameWithArg',
      { name }
    );
    if (prev && prev !== terminal) {
      prev.show(false);
    }
    renaming = false;
  }

  const onClose = async (t) => {
    const pid = await t.processId;
    if (pid) {
      tracked.delete(pid);
      lastNotified.delete(pid);
    }
  };

  context.subscriptions.push(
    thinkingWatcher.onDidCreate(onThinking),
    thinkingWatcher.onDidChange(onThinking),
    pendingWatcher.onDidCreate(onPending),
    pendingWatcher.onDidChange(onPending),
    focusWatcher.onDidCreate(onFocus),
    focusWatcher.onDidChange(onFocus),
    vscode.window.onDidChangeActiveTerminal(onActiveChange),
    vscode.window.onDidChangeWindowState(onWindowState),
    vscode.window.onDidCloseTerminal(onClose),
    thinkingWatcher,
    pendingWatcher,
    focusWatcher
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
