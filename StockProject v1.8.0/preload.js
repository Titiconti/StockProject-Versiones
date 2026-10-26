const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sp', {
  load: () => ipcRenderer.sendSync('load'),
  save: (d, base) => ipcRenderer.invoke('save', d, base),
  version: () => ipcRenderer.sendSync('version'),
  defaults: () => ipcRenderer.sendSync('defaults'),
  info: () => ipcRenderer.invoke('b:info'),
  now: () => ipcRenderer.invoke('b:now'),
  choose: () => ipcRenderer.invoke('b:choose'),
  restore: () => ipcRenderer.invoke('b:restore'),
  print: (html, opts) => ipcRenderer.invoke('print', html, opts),
  pdf: (html, name) => ipcRenderer.invoke('pdf', html, name),
  remote: () => ipcRenderer.invoke('remote:info'),
  setRemote: cfg => ipcRenderer.invoke('remote:set', cfg),
  exportBackup: () => ipcRenderer.invoke('b:export')
});
