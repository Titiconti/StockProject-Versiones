const { contextBridge, ipcRenderer } = require('electron');
// Volvió la conexión a Internet: el programa reintenta enviar al panel enseguida.
window.addEventListener('online', () => ipcRenderer.send('nube:online'));
contextBridge.exposeInMainWorld('sp', {
  load: () => ipcRenderer.sendSync('load'),
  save: (d, base) => ipcRenderer.invoke('save', d, base),
  version: () => ipcRenderer.sendSync('version'),
  tema: t => ipcRenderer.invoke('tema:set', t),
  defaults: () => ipcRenderer.sendSync('defaults'),
  info: () => ipcRenderer.invoke('b:info'),
  now: () => ipcRenderer.invoke('b:now'),
  leerXlsx: buf => ipcRenderer.invoke('xlsx:leer', buf),
  choose: () => ipcRenderer.invoke('b:choose'),
  restore: () => ipcRenderer.invoke('b:restore'),
  print: (html, opts) => ipcRenderer.invoke('print', html, opts),
  pdf: (html, name) => ipcRenderer.invoke('pdf', html, name),
  exportBackup: () => ipcRenderer.invoke('b:export'),
  emp: { listar: () => ipcRenderer.invoke('emp:listar'), crear: n => ipcRenderer.invoke('emp:crear', n), renombrar: (i, n) => ipcRenderer.invoke('emp:renombrar', i, n), cambiar: i => ipcRenderer.invoke('emp:cambiar', i), consolidado: o => ipcRenderer.invoke('emp:consolidado', o) },
  fx: { actualizar: b => ipcRenderer.invoke('fx:actualizar', b) },
  upd: { estado: () => ipcRenderer.invoke('upd:estado'), buscar: () => ipcRenderer.invoke('upd:buscar'), instalar: () => ipcRenderer.invoke('upd:instalar'), auto: v => ipcRenderer.invoke('upd:auto', v), alCambiar: f => ipcRenderer.on('upd:estado', (e, s) => f(s)) },
  sys: { metricas: () => ipcRenderer.invoke('sys:metricas') },
  precios: { alCambiar: f => ipcRenderer.on('precios:cambiados', (e, info) => { try { f(info); } catch (x) {} }) },   // solo recibe avisos: no puede crear ni aprobar cambios
  nube: { estado: () => ipcRenderer.invoke('nube:estado'), call: (n, a) => ipcRenderer.invoke('nube:call', n, a) },
  mp: Object.fromEntries(['estado', 'guardar', 'quitar', 'probar', 'crearCaja', 'terminales', 'cobrar', 'consultar', 'cancelar', 'conciliar'].map(n => [n, a => ipcRenderer.invoke('mp:' + n, a)])),
  arca: { estado: () => ipcRenderer.invoke('arca:estado'), config: p => ipcRenderer.invoke('arca:config', p), csr: o => ipcRenderer.invoke('arca:csr', o), cert: (t, a) => ipcRenderer.invoke('arca:cert', t, a), probar: () => ipcRenderer.invoke('arca:probar'), tipos: () => ipcRenderer.invoke('arca:tipos'), anular: id => ipcRenderer.invoke('arca:anular', id), facturar: (id, r) => ipcRenderer.invoke('arca:facturar', id, r), qr: u => ipcRenderer.invoke('arca:qr', u) },
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
