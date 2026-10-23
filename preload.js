const { contextBridge, ipcRenderer } = require('electron');

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
  openWeb: call('web:open'),

  download: call('file:download'),
  openPath: call('file:open'),
  showInFolder: call('file:show'),
  openDownloads: call('file:open-downloads'),
  openExternal: call('shell:open'),

  listThemes: call('themes:list'),
  readTheme: call('theme:read'),
  saveTheme: call('theme:save'),
  createTheme: call('theme:create'),
  importThemeAsset: call('theme:asset'),
  revealTheme: call('theme:reveal'),
  openEditor: call('editor:open'),
  // Not wrapped by api.js: subscribes to theme changes saved in any window.
  onThemesChanged: (cb) => { ipcRenderer.on('themes:changed', () => cb()); },
  listSites: call('sites:list'),

  setTitlebar: (color, symbolColor) => ipcRenderer.invoke('ui:titlebar', { color, symbolColor }),
});
