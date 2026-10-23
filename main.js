const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const moodle = require('./src/moodle');
const session = require('./src/session');
const { ssoLogin } = require('./src/sso');
const downloads = require('./src/downloads');

let win = null;
let client = null;

function openExternal(url) {
  try {
    const { protocol } = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(protocol)) shell.openExternal(url);
  } catch {
    // ignore malformed links
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#fbd6f5',
    title: 'i-Taleem Desktop',
    icon: path.join(__dirname, 'renderer/assets/aqua-chibi.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#fbd6f5', symbolColor: '#2f2b6e', height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Links never navigate the app window; they open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      openExternal(url);
    }
  });
}

// IPC results are wrapped as {ok, data} / {ok:false, error, code} so error codes survive the bridge.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err), code: err.code };
    }
  });
}

function requireClient() {
  if (!client) throw new moodle.MoodleError('Not signed in.', 'invalidtoken');
  return client;
}

async function establish(site, token) {
  const c = new moodle.MoodleClient(site, token);
  const info = await c.call('core_webservice_get_site_info');
  client = c;
  await session.save({ site, token });
  return {
    site,
    sitename: info.sitename,
    userid: info.userid,
    username: info.username,
    firstname: info.firstname,
    fullname: info.fullname,
    userpicture: c.tokenize(info.userpictureurl),
  };
}

handle('auth:public-config', async (site) => moodle.getPublicConfig(moodle.normalizeSite(site)));

handle('auth:login', async ({ site, username, password }) => {
  const s = moodle.normalizeSite(site);
  const token = await moodle.loginWithPassword(s, username, password);
  return establish(s, token);
});

handle('auth:sso', async ({ site, launchurl }) => {
  const s = moodle.normalizeSite(site);
  const token = await ssoLogin(win, s, launchurl);
  return establish(s, token);
});

handle('auth:restore', async () => {
  const saved = await session.load();
  if (!saved) return null;
  try {
    return await establish(saved.site, saved.token);
  } catch (err) {
    if (err.code === 'invalidtoken') {
      await session.clear();
      return null;
    }
    throw err;
  }
});

handle('auth:logout', async () => {
  client = null;
  await session.clear();
});

handle('ws:call', async (wsfunction, params) => {
  try {
    return await requireClient().call(wsfunction, params);
  } catch (err) {
    if (err.code === 'invalidtoken') {
      client = null;
      await session.clear();
    }
    throw err;
  }
});

handle('ws:tokenize', async (urls) => {
  const c = requireClient();
  return Array.isArray(urls) ? urls.map((u) => c.tokenize(u)) : c.tokenize(urls);
});

handle('file:download', async (opts) => downloads.downloadFile(requireClient(), opts));
handle('file:open', async (p) => {
  const err = await shell.openPath(p);
  if (err) throw new Error(err);
});
handle('file:show', async (p) => shell.showItemInFolder(p));
handle('file:open-downloads', async () => {
  fs.mkdirSync(downloads.root(), { recursive: true });
  await shell.openPath(downloads.root());
});

handle('shell:open', async (url) => openExternal(url));

handle('ui:titlebar', async ({ color, symbolColor }) => {
  if (win && process.platform !== 'darwin') win.setTitleBarOverlay({ color, symbolColor, height: 44 });
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
