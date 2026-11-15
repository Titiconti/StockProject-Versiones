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
  exportBackup: () => ipcRenderer.invoke('b:export'),
  emp: { listar: () => ipcRenderer.invoke('emp:listar'), crear: n => ipcRenderer.invoke('emp:crear', n), renombrar: (i, n) => ipcRenderer.invoke('emp:renombrar', i, n), cambiar: i => ipcRenderer.invoke('emp:cambiar', i), consolidado: o => ipcRenderer.invoke('emp:consolidado', o) },
  fx: { actualizar: b => ipcRenderer.invoke('fx:actualizar', b) },
  upd: { estado: () => ipcRenderer.invoke('upd:estado'), buscar: () => ipcRenderer.invoke('upd:buscar'), instalar: () => ipcRenderer.invoke('upd:instalar'), auto: v => ipcRenderer.invoke('upd:auto', v), alCambiar: f => ipcRenderer.on('upd:estado', (e, s) => f(s)) },
  sys: { metricas: () => ipcRenderer.invoke('sys:metricas') },
  nube: { estado: () => ipcRenderer.invoke('nube:estado'), call: (n, a) => ipcRenderer.invoke('nube:call', n, a) },
  seg: {
    estado: () => ipcRenderer.invoke('seg:estado'),
    activar: () => ipcRenderer.invoke('seg:activar'),
    desactivar: () => ipcRenderer.invoke('seg:desactivar'),
    importarClave: hex => ipcRenderer.invoke('seg:importarClave', hex),
    copiaProtegida: pw => ipcRenderer.invoke('seg:copiaProtegida', pw),
    restaurarProtegida: pw => ipcRenderer.invoke('seg:restaurarProtegida', pw)
  },
  auth: {
    estado: () => ipcRenderer.sendSync('auth:estado'),
    call: (nombre, ...args) => ipcRenderer.invoke('auth:call', nombre, args),
    login: (u, c) => ipcRenderer.invoke('auth:login', u, c),
    logout: () => ipcRenderer.invoke('auth:logout'),
    ir: () => ipcRenderer.invoke('auth:ir')
  }
});
