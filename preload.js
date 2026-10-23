const { contextBridge, ipcRenderer } = require('electron');

// Each call resolves to {ok, data} or {ok:false, error, code}. Errors are rebuilt in
// renderer/js/api.js because custom fields like .code don't survive contextBridge.
const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

// Everything the UI can do lives here. The renderer never sees Node or the raw token store.
contextBridge.exposeInMainWorld('italeemBridge', {
  getPublicConfig: call('auth:public-config'),
  login: (site, username, password) => ipcRenderer.invoke('auth:login', { site, username, password }),
  loginSSO: (site, launchurl) => ipcRenderer.invoke('auth:sso', { site, launchurl }),
  restore: call('auth:restore'),
  logout: call('auth:logout'),

  call: call('ws:call'),
  tokenize: call('ws:tokenize'),

  download: call('file:download'),
  openPath: call('file:open'),
  showInFolder: call('file:show'),
  openDownloads: call('file:open-downloads'),
  openExternal: call('shell:open'),

  setTitlebar: (color, symbolColor) => ipcRenderer.invoke('ui:titlebar', { color, symbolColor }),
});
