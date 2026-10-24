const { app, BrowserWindow, dialog, ipcMain, session: electronSession, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const moodle = require('./src/moodle');
const session = require('./src/session');
const { ssoLogin } = require('./src/sso');
const downloads = require('./src/downloads');
const packs = require('./src/packs');
const submissions = require('./src/submissions');

packs.registerScheme();

const ICON = path.join(__dirname, process.platform === 'win32' ? 'build/icon.ico' : 'build/icon.png');

let win = null;
let editorWin = null;
let webWin = null;
let client = null;
let lastAutologin = 0;

const WEB_PARTITION = 'persist:moodle';
const AUTOLOGIN_GAP_MS = 6 * 60 * 1000; // Moodle's default minimum time between autologin keys

const webPreferences = () => ({
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
});

// Links never navigate an app window. Moodle pages open in NEKO's in-app window, anything else in the browser.
function guardNavigation(w) {
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (client?.isOwnUrl(url)) openWeb(url);
    else openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      openExternal(url);
    }
  });
}

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
    backgroundColor: '#f3f4f9',
    title: 'NEKO',
    icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f3f4f9', symbolColor: '#1d2033', height: 44 },
    webPreferences: webPreferences(),
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer/index.html'));
  guardNavigation(win);
}

function openEditor(themeId) {
  const query = { theme: themeId };
  if (editorWin && !editorWin.isDestroyed()) {
    editorWin.loadFile(path.join(__dirname, 'renderer/editor.html'), { query }); // asks first if there are unsaved changes
    editorWin.focus();
    return;
  }
  editorWin = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'NEKO theme editor',
    backgroundColor: '#16181f',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  });
  editorWin.once('ready-to-show', () => editorWin.show());
  editorWin.loadFile(path.join(__dirname, 'renderer/editor.html'), { query });
  guardNavigation(editorWin);
  // The editor blocks unload while it has unsaved changes; confirm here instead.
  editorWin.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(editorWin, {
      type: 'question',
      buttons: ['Discard changes', 'Keep editing'],
      defaultId: 1,
      cancelId: 1,
      message: 'You have unsaved theme changes.',
      detail: 'Discard them?',
    });
    if (choice === 0) e.preventDefault();
  });
  editorWin.on('closed', () => { editorWin = null; });
}

// In-app window for Moodle pages NEKO doesn't show natively yet. It keeps its own signed-in session
// (cookies persist), and signs itself in with a one-time autologin link when Moodle asks for a login.
function openWeb(url) {
  if (!client?.isOwnUrl(url)) return openExternal(url);
  if (!webWin || webWin.isDestroyed()) {
    webWin = new BrowserWindow({
      width: 1180,
      height: 860,
      minWidth: 700,
      minHeight: 500,
      title: 'NEKO',
      icon: ICON,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: { partition: WEB_PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    const wc = webWin.webContents;
    wc.setWindowOpenHandler(({ url: u }) => {
      if (client?.isOwnUrl(u)) webWin.loadURL(u);
      else openExternal(u);
      return { action: 'deny' };
    });
    const onNav = (_e, u, _inPlace, isMainFrame) => { if (isMainFrame !== false) autologinIfAsked(u); };
    wc.on('did-start-navigation', onNav);
    wc.on('did-redirect-navigation', onNav);
    webWin.on('closed', () => { webWin = null; });
  }
  webWin.target = url;
  webWin.triedAutologin = false;
  webWin.loadURL(url);
  webWin.show();
  webWin.focus();
}

async function autologinIfAsked(u) {
  if (!webWin || webWin.triedAutologin || !client?.privatetoken || !client.isOwnUrl(u)) return;
  if (!/\/login\/index\.php$/.test(new URL(u).pathname)) return;
  if (Date.now() - lastAutologin < AUTOLOGIN_GAP_MS) return; // too soon: the user signs in on the page instead
  webWin.triedAutologin = true;
  lastAutologin = Date.now();
  try {
    const link = await client.autologinUrl(webWin.target);
    if (webWin && !webWin.isDestroyed()) webWin.loadURL(link);
  } catch (e) {
    console.warn(`Autologin failed: ${e.message}`);
  }
}

function broadcastThemesChanged() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('themes:changed');
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

async function establish(site, { token, privatetoken = null }) {
  const c = new moodle.MoodleClient(site, token, privatetoken);
  const info = await c.call('core_webservice_get_site_info');
  c.userid = info.userid;
  client = c;
  await session.save({ site, token, privatetoken });
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
  return establish(s, await moodle.loginWithPassword(s, username, password));
});

handle('auth:sso', async ({ site, launchurl }) => {
  const s = moodle.normalizeSite(site);
  return establish(s, await ssoLogin(win, s, launchurl));
});

handle('auth:restore', async () => {
  const saved = await session.load();
  if (!saved) return null;
  try {
    return await establish(saved.site, saved);
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
  if (webWin && !webWin.isDestroyed()) webWin.destroy();
  await electronSession.fromPartition(WEB_PARTITION).clearStorageData();
});

handle('ws:fetch-html', async (url) => requireClient().fetchHtml(url));
handle('ws:rewrite-html', async (html, base) => requireClient().rewriteHtml(html, base));
handle('web:open', async (url) => openWeb(url));

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
handle('downloads:folder', async () => downloads.folderInfo());
handle('downloads:choose', async () => downloads.chooseRoot(win));
handle('downloads:reset', async () => downloads.resetRoot());

handle('shell:open', async (url) => openExternal(url));

handle('submit:pick', async (opts) => submissions.pick(win, opts));
handle('submit:dropped', async (paths) => submissions.register(Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && p) : []));
handle('submit:save', async (data) => submissions.save(requireClient(), data));

handle('themes:list', async () => packs.listThemes());
handle('theme:read', async (id) => packs.readTheme(id));
handle('theme:save', async (data) => {
  packs.saveTheme(data);
  broadcastThemesChanged();
});
handle('theme:create', async (data) => {
  const id = packs.createTheme(data);
  broadcastThemesChanged();
  return id;
});
handle('theme:delete', async (id) => {
  // An editor open on this theme would save it back, so close it first (unsaved edits go with the theme).
  if (editorWin && !editorWin.isDestroyed() && new URL(editorWin.webContents.getURL()).searchParams.get('theme') === id) editorWin.destroy();
  await packs.deleteTheme(id);
  broadcastThemesChanged();
});
handle('themes:import', async () => {
  const res = await packs.importThemes(win);
  if (res?.ids.length) broadcastThemesChanged();
  return res;
});
handle('themes:open-folder', async () => {
  const err = await shell.openPath(packs.userFolder());
  if (err) throw new Error(err);
});
handle('theme:reveal', async (id) => {
  const dir = packs.themeDir(id);
  if (dir) await shell.openPath(dir);
});
handle('editor:open', async (id) => openEditor(id));
ipcMain.handle('theme:asset', async (e, data) => {
  try {
    return { ok: true, data: await packs.importAsset(BrowserWindow.fromWebContents(e.sender), data) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
handle('sites:list', async () => packs.listSites());

handle('ui:titlebar', async ({ color, symbolColor }) => {
  if (win && !win.isDestroyed() && process.platform !== 'darwin') win.setTitleBarOverlay({ color, symbolColor, height: 44 });
});

app.whenReady().then(() => {
  packs.migrateUserThemes();
  packs.handleProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
