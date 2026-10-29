// Living on the desktop: the tray icon (closing the window keeps NEKO running there) and opening NEKO when
// you sign in to Windows. Both are off until switched on in Settings (kept in <userData>/desktop.json).
// Started by Windows with the tray on, NEKO opens straight to the tray instead of showing its window.

const { app, Menu, Tray } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const STARTUP_ARG = '--startup';
const configFile = () => path.join(app.getPath('userData'), 'desktop.json');

let tray = null;
let quitting = false;
let hintShown = false;
let getWindow = () => null;
let icon = null;

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    return { tray: data.tray === true };
  } catch {
    return { tray: false };
  }
}

function save(data) {
  fs.writeFileSync(configFile(), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// The login item points at the real exe: for the portable build that's the file the person started,
// not the copy it unpacks to a temporary folder. Running from source there's no app to register.
function loginItem() {
  if (!app.isPackaged) return null;
  return { path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: [STARTUP_ARG] };
}

function settings() {
  const item = loginItem();
  return {
    tray: load().tray,
    startup: item ? app.getLoginItemSettings(item).openAtLogin : false,
    startupAvailable: !!item,
  };
}

function set(key, on) {
  on = on === true;
  if (key === 'tray') {
    save({ ...load(), tray: on });
    if (on) createTray();
    else destroyTray();
  } else if (key === 'startup') {
    const item = loginItem();
    if (!item) throw new Error('Open on startup only works in the installed app.');
    app.setLoginItemSettings({ ...item, openAtLogin: on });
  } else {
    throw new Error(`Unknown setting: ${key}`);
  }
  return settings();
}

function show() {
  const w = getWindow();
  if (!w || w.isDestroyed()) return;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
}

function createTray() {
  if (tray) return;
  tray = new Tray(icon);
  tray.setToolTip('NEKO');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open NEKO', click: show },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('click', show);
}

function destroyTray() {
  tray?.destroy();
  tray = null;
}

// Sets up the tray. `window` returns the main window (it can be recreated).
function init({ window, iconPath }) {
  getWindow = window;
  icon = iconPath;
  app.on('before-quit', () => { quitting = true; });
  if (load().tray) createTray();
}

// Closing the main window hides it to the tray while the tray is on. Quitting (tray menu, an update) still closes it.
function guardClose(w) {
  w.on('close', (e) => {
    if (quitting || !tray) return;
    e.preventDefault();
    w.hide();
    if (!hintShown && process.platform === 'win32') {
      hintShown = true;
      tray.displayBalloon({ title: 'NEKO is still running', content: 'It\'s in the tray. Right-click the icon to quit.', iconType: 'info' });
    }
  });
}

// Started by Windows at sign-in with the tray on: stay in the tray until the icon is clicked.
const startHidden = () => process.argv.includes(STARTUP_ARG) && !!tray;

module.exports = { init, guardClose, settings, set, show, startHidden };
