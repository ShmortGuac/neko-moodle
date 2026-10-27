const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Each call resolves to {ok, data} or {ok:false, error, code}. Errors are rebuilt in
// renderer/js/api.js because custom fields like .code don't survive contextBridge.
const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

// Everything the UI can do lives here. The renderer never sees Node or the raw token store.
contextBridge.exposeInMainWorld('nekoBridge', {
  getPublicConfig: call('auth:public-config'),
  login: (site, username, password) => ipcRenderer.invoke('auth:login', { site, username, password }),
  loginSSO: (site, launchurl) => ipcRenderer.invoke('auth:sso', { site, launchurl }),
  restore: call('auth:restore'),
  logout: call('auth:logout'),

  call: call('ws:call'),
  tokenize: call('ws:tokenize'),
  fetchHtml: call('ws:fetch-html'),
  rewriteHtml: call('ws:rewrite-html'),
  openWeb: call('web:open'),

  download: call('file:download'),
  previewFile: call('file:preview'),
  openPath: call('file:open'),
  showInFolder: call('file:show'),
  openDownloads: call('file:open-downloads'),
  downloadFolder: call('downloads:folder'),
  chooseDownloadFolder: call('downloads:choose'),
  resetDownloadFolder: call('downloads:reset'),
  openExternal: call('shell:open'),

  // Files for an assignment submission. Dropped files are File objects; only real dropped files have a path.
  pickFiles: call('submit:pick'),
  addDroppedFiles: (files) => ipcRenderer.invoke('submit:dropped', [...files].map((f) => webUtils.getPathForFile(f))),
  saveSubmission: call('submit:save'),

  listThemes: call('themes:list'),
  readTheme: call('theme:read'),
  saveTheme: call('theme:save'),
  createTheme: call('theme:create'),
  deleteTheme: call('theme:delete'),
  importThemes: call('themes:import'),
  openThemesFolder: call('themes:open-folder'),
  exportTheme: call('theme:export'),
  importThemeAsset: call('theme:asset'),
  revealTheme: call('theme:reveal'),
  openEditor: call('editor:open'),
  // Not wrapped by api.js: subscribes to theme changes saved in any window.
  onThemesChanged: (cb) => { ipcRenderer.on('themes:changed', () => cb()); },
  listSites: call('sites:list'),

  updateStatus: call('updates:status'),
  checkForUpdates: call('updates:check'),
  whatsNew: call('updates:whats-new'),
  justUpdated: call('updates:just-updated'),
  markUpdateSeen: call('updates:seen'),
  setAutoUpdateCheck: call('updates:auto'),
  downloadUpdate: call('updates:download'),
  installUpdate: call('updates:install'),
  showUpdateFile: call('updates:show'),
  openReleasePage: call('updates:page'),
  // Not wrapped by api.js: a newer version was found / download progress.
  onUpdateAvailable: (cb) => { ipcRenderer.on('updates:available', (_e, s) => cb(s)); },
  onUpdateProgress: (cb) => { ipcRenderer.on('updates:progress', (_e, s) => cb(s)); },

  setTitlebar: (color, symbolColor) => ipcRenderer.invoke('ui:titlebar', { color, symbolColor }),
});
