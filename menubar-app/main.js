const { app, globalShortcut } = require('electron');
const { menubar } = require('menubar');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOKS_DIR = path.join(os.homedir(), '.claude', 'hooks');
const STATE_FILE = path.join(HOOKS_DIR, '.focus-state.json');
const SIGNAL_FILE = path.join(HOOKS_DIR, '.focus-signal');

const mb = menubar({
  index: `file://${path.join(__dirname, 'index.html')}`,
  icon: path.join(__dirname, 'iconTemplate.png'),
  preloadWindow: true,
  browserWindow: {
    width: 360,
    height: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  },
});

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function updateTrayBadge() {
  const state = readState();
  const count = state.filter(s => s.state === 'attention' || s.state === 'done').length;
  mb.tray.setTitle(count > 0 ? String(count) : '');
}

function focusMostRecentSession() {
  const state = readState();
  if (!state.length) return;

  // Sort by timestamp descending
  state.sort((a, b) => b.timestamp - a.timestamp);

  // Prefer attention/done, fallback to thinking
  const target = state.find(s => s.state === 'attention' || s.state === 'done')
    || state.find(s => s.state === 'thinking');
  if (target) {
    fs.writeFileSync(SIGNAL_FILE, String(target.pid));
  }
}

mb.on('ready', () => {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  try { fs.writeFileSync(STATE_FILE, '[]', { flag: 'wx' }); } catch {}

  // Event-driven tray badge update + polling fallback (fs.watch unreliable with atomic mv)
  let debounce = null;
  fs.watch(STATE_FILE, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => updateTrayBadge(), 200);
  });
  updateTrayBadge();
  setInterval(() => updateTrayBadge(), 3000);

  globalShortcut.register('CommandOrControl+Shift+C', focusMostRecentSession);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
