const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const SIGNAL_DIR = path.join(process.env.HOME, '.claude', 'hooks');
const PENDING_FILE = path.join(SIGNAL_DIR, '.focus-pending');
const FOCUS_FILE = path.join(SIGNAL_DIR, '.focus-signal');
const MARKER = '● ';
const { execFileSync } = require('child_process');
const NOTIFIER = (() => {
  try { return execFileSync('which', ['terminal-notifier'], { encoding: 'utf8' }).trim(); }
  catch { return 'terminal-notifier'; }
})();

const pending = new Map();
let renaming = false;

function activate(context) {
  const dir = vscode.Uri.file(SIGNAL_DIR);

  const pendingWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(dir, '.focus-pending')
  );
  const focusWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(dir, '.focus-signal')
  );

  const onPending = async () => {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    } catch { return; }
    try { fs.unlinkSync(PENDING_FILE); } catch {}

    const targetPid = parseInt(data.pid, 10);
    if (!targetPid) return;

    for (const t of vscode.window.terminals) {
      const pid = await t.processId;
      if (pid === targetPid) {
        if (vscode.window.activeTerminal === t) return;

        // Send notification via terminal-notifier (execFile avoids shell injection)
        execFile(NOTIFIER, [
          '-title', data.title || 'Claude Code',
          '-message', data.message || 'done',
          '-sound', data.sound || 'Glass',
          '-execute', `echo ${targetPid} > '${FOCUS_FILE}'`
        ]);

        // Mark terminal name
        if (!pending.has(pid)) {
          pending.set(pid, t.name);
          renaming = true;
          const prev = vscode.window.activeTerminal;
          t.show(false);
          await vscode.commands.executeCommand(
            'workbench.action.terminal.renameWithArg',
            { name: MARKER + t.name }
          );
          if (prev && prev !== t) {
            prev.show(false);
          }
          renaming = false;
        }
        return;
      }
    }
  };

  const onFocus = async () => {
    let targetPid = 0;
    try {
      targetPid = parseInt(fs.readFileSync(FOCUS_FILE, 'utf8').trim(), 10);
    } catch {}
    try { fs.unlinkSync(FOCUS_FILE); } catch {}
    if (!targetPid) return;

    for (const t of vscode.window.terminals) {
      const pid = await t.processId;
      if (pid === targetPid) {
        t.show(false);
        await clearMarker(t, pid);
        return;
      }
    }
  };

  const onActiveChange = async (t) => {
    if (!t || renaming) return;
    const pid = await t.processId;
    if (pending.has(pid)) {
      await clearMarker(t, pid);
    }
  };

  async function clearMarker(terminal, pid) {
    const origName = pending.get(pid);
    if (!origName) return;
    pending.delete(pid);
    await vscode.commands.executeCommand(
      'workbench.action.terminal.renameWithArg',
      { name: origName }
    );
  }

  const onClose = async (t) => {
    const pid = await t.processId;
    if (pid) pending.delete(pid);
  };

  context.subscriptions.push(
    pendingWatcher.onDidCreate(onPending),
    pendingWatcher.onDidChange(onPending),
    focusWatcher.onDidCreate(onFocus),
    focusWatcher.onDidChange(onFocus),
    vscode.window.onDidChangeActiveTerminal(onActiveChange),
    vscode.window.onDidCloseTerminal(onClose),
    pendingWatcher,
    focusWatcher
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
