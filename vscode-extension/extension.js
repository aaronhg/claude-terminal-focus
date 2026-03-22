const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const SIGNAL_DIR = path.join(process.env.HOME, '.claude', 'hooks');
const PENDING_FILE = path.join(SIGNAL_DIR, '.focus-pending');
const FOCUS_FILE = path.join(SIGNAL_DIR, '.focus-signal');
const STATE_FILE = path.join(SIGNAL_DIR, '.focus-state.json');
const NOTIFIER = (() => {
  try { return execFileSync('which', ['terminal-notifier'], { encoding: 'utf8' }).trim(); }
  catch { return 'terminal-notifier'; }
})();

function ackStateFile(pid) {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    if (!raw.some(s => s.pid === pid && (s.state === 'done' || s.state === 'attention'))) return;
    const data = raw.map(s =>
      s.pid === pid && (s.state === 'done' || s.state === 'attention')
        ? { ...s, state: 'seen' } : s
    );
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch {}
}

// Debounce: PID → timestamp of last notification
const lastNotified = new Map();

function activate(context) {
  const dir = vscode.Uri.file(SIGNAL_DIR);

  const pendingWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(dir, '.focus-pending')
  );
  const focusWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(dir, '.focus-signal')
  );

  // Claude finished / needs attention → notify
  const onPending = async () => {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
      fs.unlinkSync(PENDING_FILE);
    } catch { return; }

    const targetPid = parseInt(data.pid, 10);
    if (!targetPid) return;

    // Only notify if this terminal belongs to this window
    let owns = false;
    for (const t of vscode.window.terminals) {
      if ((await t.processId) === targetPid) { owns = true; break; }
    }
    if (!owns) return;

    ackStateFile(targetPid);

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
  };

  // User clicks notification → focus terminal
  const onFocus = async () => {
    let targetPid = 0;
    try {
      targetPid = parseInt(fs.readFileSync(FOCUS_FILE, 'utf8').trim(), 10);
      fs.unlinkSync(FOCUS_FILE);
    } catch {}
    if (!targetPid) return;

    for (const t of vscode.window.terminals) {
      const pid = await t.processId;
      if (pid === targetPid) {
        // Bring app to foreground + select correct window, then focus terminal
        const appName = vscode.env.appName || 'Visual Studio Code';
        execFile('osascript', ['-e', `tell application "${appName}" to activate`]);
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (folder) execFile('code', [folder]);
        t.show(false);
        ackStateFile(targetPid);
        return;
      }
    }
  };

  // Window regains focus — ack active terminal if pending
  const onWindowState = async (e) => {
    if (!e.focused) return;
    const t = vscode.window.activeTerminal;
    if (!t) return;
    const pid = await t.processId;
    if (pid) ackStateFile(pid);
  };

  const onClose = async (t) => {
    const pid = await t.processId;
    if (pid) lastNotified.delete(pid);
  };

  context.subscriptions.push(
    pendingWatcher.onDidCreate(onPending),
    pendingWatcher.onDidChange(onPending),
    focusWatcher.onDidCreate(onFocus),
    focusWatcher.onDidChange(onFocus),
    vscode.window.onDidChangeWindowState(onWindowState),
    vscode.window.onDidCloseTerminal(onClose),
    pendingWatcher,
    focusWatcher
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
