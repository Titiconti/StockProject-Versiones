const { app, BrowserWindow, Menu, ipcMain, dialog, shell, safeStorage } = require('electron');
const crypto = require('crypto');
const path = require('path'), fs = require('fs');
if (!app.requestSingleInstanceLock()) app.quit();
let win, store;
const defaults = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8')) } catch (e) { return {} } };

let usr, integ, emp, tok = null;                                   // usuarios y sesión de esta ventana (el token nunca llega a la interfaz)
const quien = () => (usr && usr.habilitado() ? usr.sesion(tok) : null);
const permite = (m, a) => !usr.habilitado() || usr.tiene(quien(), m, a);
let faltaClave = false;                               // datos cifrados y sin la clave de este equipo: se pide la clave de recuperación
const pagina = () => path.join(__dirname, faltaClave ? 'clave.html' : usr.habilitado() && !quien() ? 'login.html' : 'index.html');

function crear() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1280, height: 800, title: 'StockProject', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.maximize();
  // enlaces de WhatsApp, correo o pago: se abren en el programa predeterminado de Windows, nunca dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(pagina());
}

app.whenReady().then(() => {
  const ud = app.getPath('userData');
  const opcionesStore = { docsDir: app.getPath('documents'), home: app.getPath('home'), defaults: defaults() };
  const principal = require('./store')({ dataFile: path.join(ud, 'stockproject-data.json'), configFile: path.join(ud, 'config.json'), ...opcionesStore });
  // Varias empresas: `store` apunta siempre a la empresa activa (el resto del programa no se entera del cambio).
  emp = require('./empresas')({ dir: ud, principal, crearStore: o => require('./store')(o), opcionesComunes: opcionesStore, alCrear: s => s.onPut(t => integ && integ.alGuardar(t)) });
  store = new Proxy({}, { get: (_, k) => { const s = emp.activa(), v = s[k]; return typeof v === 'function' ? v.bind(s) : v; } });
  // Cifrado en reposo (opcional): la clave vive en este equipo protegida por Windows (DPAPI) y se puede recuperar con la clave de respaldo.
  const keyFile = path.join(ud, 'clave-datos.bin'), cfgS = () => principal.getConfig();
  const guardarClave = k => fs.writeFileSync(keyFile, safeStorage.encryptString(k.toString('hex')));
  const leerClave = () => { try { return Buffer.from(safeStorage.decryptString(fs.readFileSync(keyFile)), 'hex'); } catch (x) { return null; } };
  if (cfgS().cifrado) { const k = safeStorage.isEncryptionAvailable() ? leerClave() : null; if (k && k.length === 32) emp.setKey(k); else faltaClave = true; }
  integ = require('./integraciones')({ file: path.join(ud, 'integraciones.json') });
  store.onPut(t => integ.alGuardar(t));
  usr = require('./usuarios')({ usersFile: path.join(ud, 'usuarios.json'), auditFile: path.join(ud, 'auditoria.jsonl') });
  ipcMain.on('load', e => { try { e.returnValue = usr.habilitado() && !quien() ? '' : store.load() } catch (x) { e.returnValue = '' } });
  ipcMain.on('auth:estado', e => { e.returnValue = usr.llamar(tok, 'estado'); });
  ipcMain.handle('auth:call', (e, nombre, args) => {
    if (!usr.NOMBRES.includes(nombre)) return { ok: false };
    const primero = nombre === 'crear' && !usr.habilitado();
    const r = usr.llamar(tok, nombre, Array.isArray(args) ? args : []);
    if (primero && r.ok) { const l = usr.login(args[0].user, args[0].clave, 'Escritorio'); if (l.ok) tok = l.token; }
    return r;
  });
  ipcMain.handle('auth:login', (e, u, c) => { const r = usr.login(u, c, 'Escritorio'); if (!r.ok) return r; tok = r.token; win.loadFile(pagina()); return { ok: true }; });
  ipcMain.handle('auth:logout', () => { usr.logout(tok); tok = null; win.loadFile(pagina()); return { ok: true }; });
  ipcMain.handle('auth:ir', () => { win.loadFile(pagina()); return true; });
  if (!faltaClave) try { store.load(); } catch (x) {}   // inicializa la versión de los datos antes de abrir el acceso remoto
  ipcMain.handle('save', (e, s, base) => { try { if (usr.habilitado()) { const q = quien(); if (!q) return { ok: false, auth: true, err: 'La sesión venció: volvé a ingresar' }; if (!usr.puedeEscribir(q)) return { ok: false, err: 'Tu usuario es de solo consulta' }; } return store.put(s, base) } catch (x) { return { ok: false, err: String((x && x.message) || x) } } });
  ipcMain.on('version', e => { e.returnValue = store.rev(); });
  ipcMain.on('defaults', e => { e.returnValue = defaults() });
  ipcMain.handle('b:info', () => store.info());
  ipcMain.handle('b:now', () => { if (!permite('respaldo', 'crear')) return store.info(); usr.audit(quien(), 'respaldo.crear'); return store.backup(); });
  ipcMain.handle('b:choose', async () => {
    if (!permite('respaldo', 'editar')) return store.info();
    const r = await dialog.showOpenDialog(win, { title: 'Elegí la carpeta de respaldo', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return store.info();
    store.setDir(r.filePaths[0]);
    return store.backup();
  });
  ipcMain.handle('b:restore', async () => {
    if (!permite('respaldo', 'eliminar')) return false;
    const r = await dialog.showOpenDialog(win, { title: 'Elegí la copia a restaurar', properties: ['openFile'],
      filters: [{ name: 'Copia de StockProject', extensions: ['json'] }], defaultPath: store.info().dir });
    if (r.canceled) return false;
    const c = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Restaurar', 'Cancelar'], defaultId: 1, cancelId: 1,
      message: 'Se van a reemplazar los datos actuales por los de esta copia.', detail: 'Antes se guarda una copia de los datos actuales, por seguridad.' });
    if (c.response !== 0) return false;
    if (store.restoreFrom(r.filePaths[0])) { usr.audit(quien(), 'respaldo.restaurar', path.basename(r.filePaths[0])); win.reload(); return true; }
    dialog.showErrorBox('StockProject', 'El archivo elegido no es una copia válida.');
    return false;
  });
  // Impresión de tickets: window.print() no funciona dentro de Electron, se imprime desde acá.
  ipcMain.handle('print', (e, html, opts) => new Promise(res => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html)));
    w.webContents.once('did-fail-load', () => { res({ ok: false, err: 'no se pudo preparar el ticket' }); w.destroy(); });
    w.webContents.once('did-finish-load', () => {
      const a4 = !!(opts && opts.a4);
      w.webContents.print({ silent: !!defaults().imprimirDirecto, printBackground: a4, ...(a4 ? { pageSize: 'A4', margins: { marginType: 'none' } } : {}) }, (ok, err) => { res({ ok, err }); w.destroy(); });
    });
  }));
  // Resumen de ventas en PDF: pide dónde guardarlo, lo genera y lo abre.
  ipcMain.handle('pdf', async (e, html, name) => {
    const r = await dialog.showSaveDialog(win, { title: 'Guardar resumen en PDF', defaultPath: path.join(app.getPath('documents'), String(name || 'Resumen.pdf')), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    const tmp = path.join(app.getPath('temp'), 'stockproject-resumen-' + Date.now() + '.html');
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      fs.writeFileSync(tmp, String(html));
      await w.loadFile(tmp);
      const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#666"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        margins: { top: 0.47, bottom: 0.6, left: 0.47, right: 0.47 } });
      fs.writeFileSync(r.filePath, pdf);
      shell.openPath(r.filePath);
      return { ok: true, file: r.filePath };
    } catch (err) {
      return { ok: false, err: String((err && err.message) || err) };
    } finally {
      w.destroy();
      try { fs.unlinkSync(tmp); } catch (x) {}
    }
  });
  ipcMain.handle('int:call', async (e, n, a) => {
    if (!permite('configuracion', 'editar')) return { ok: false, err: 'Solo un administrador puede cambiar las integraciones' };
    const f = { crearToken: integ.crearToken, listarTokens: integ.listarTokens, revocarToken: integ.revocarToken, crearHook: integ.crearHook, listarHooks: integ.listarHooks, borrarHook: integ.borrarHook, activarHook: integ.activarHook, probar: integ.probar, historial: integ.historial }[n];
    if (!f) return { ok: false };
    const r = await f(...(Array.isArray(a) ? a : []));
    if (/^(crear|revocar|borrar)/.test(n)) usr.audit(quien(), 'integraciones.' + n, '');
    if (n === 'crearHook' || n === 'activarHook') integ.iniciar(store.snapshot());
    return r;
  });
  // Empresas y tipos de cambio
  const sinPermiso = { ok: false, err: 'Solo un administrador puede cambiar esto' };
  ipcMain.handle('emp:listar', () => emp.listar());
  ipcMain.handle('emp:crear', (e, n) => { if (!permite('configuracion', 'editar')) return sinPermiso; const r = emp.crear(n); if (r.ok) usr.audit(quien(), 'empresa.crear', n); return r; });
  ipcMain.handle('emp:renombrar', (e, id, n) => permite('configuracion', 'editar') ? emp.renombrar(id, n) : sinPermiso);
  ipcMain.handle('emp:cambiar', (e, id) => {
    if (!permite('configuracion', 'editar')) return sinPermiso;
    const r = emp.cambiar(id); if (!r.ok) return r;
    try { store.load(); } catch (x) {} integ.iniciar(store.snapshot()); usr.audit(quien(), 'empresa.cambiar', id); win.loadFile(pagina()); return { ok: true };
  });
  ipcMain.handle('emp:consolidado', (e, o) => permite('reporte', 'ver') && permite('configuracion', 'ver') ? emp.consolidado({ desde: String(o.desde), hasta: String(o.hasta), base: String(o.base), estado: o.estado || {} }) : null);
  ipcMain.handle('fx:actualizar', async (e, base) => permite('configuracion', 'editar') ? require('./monedas').actualizar((...a) => fetch(...a), base) : sinPermiso);
  ipcMain.handle('sys:metricas', () => {
    const m = app.getAppMetrics(), os = require('os'), r = remoto.info(), inf = store.info();
    return { cpu: Math.round(m.reduce((a, x) => a + ((x.cpu && x.cpu.percentCPU) || 0), 0) * 10) / 10, memMB: Math.round(m.reduce((a, x) => a + ((x.memory && x.memory.workingSetSize) || 0), 0) / 1024), libreMB: Math.round(os.freemem() / 1048576), archivoMB: Math.round(store.tam() / 1048576 * 100) / 100, iniciada: Math.round(process.uptime()), ultimoRespaldo: inf.last, servidor: r.running ? { puerto: r.port, https: r.https, ...(r.stats || {}) } : null, rev: store.rev() };
  });
  ipcMain.handle('seg:estado', () => ({ disponible: safeStorage.isEncryptionAvailable(), activo: !!cfgS().cifrado, falta: faltaClave, cifrado: store.cifrado() }));
  ipcMain.handle('seg:activar', () => {
    if (!permite('usuarios', 'editar')) return { ok: false, err: 'Solo un administrador puede cambiar el cifrado' };
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, err: 'Este equipo no permite proteger la clave (Windows no la ofrece).' };
    const k = crypto.randomBytes(32); guardarClave(k); principal.setConfig({ cifrado: true }); emp.setKey(k); store.backup();
    usr.audit(quien(), 'seguridad.cifrado_on'); return { ok: true, clave: k.toString('hex') };
  });
  ipcMain.handle('seg:desactivar', () => {
    if (!permite('usuarios', 'editar')) return { ok: false, err: 'Solo un administrador puede cambiar el cifrado' };
    emp.setKey(null); principal.setConfig({ cifrado: false }); try { fs.unlinkSync(keyFile); } catch (x) {} store.backup();
    usr.audit(quien(), 'seguridad.cifrado_off'); return { ok: true };
  });
  ipcMain.handle('seg:importarClave', (e, hex) => {
    const h = String(hex || '').replace(/[^0-9a-f]/gi, '');
    if (h.length !== 64) return { ok: false, err: 'La clave de recuperación tiene 64 caracteres (letras de la A a la F y números).' };
    emp.setKey(Buffer.from(h, 'hex'));
    if (!store.snapshot()) { emp.setKey(null); return { ok: false, err: 'Esa clave no abre los datos.' }; }
    guardarClave(Buffer.from(h, 'hex')); faltaClave = false; store.load(); usr.audit(null, 'seguridad.clave_recuperada'); win.loadFile(pagina()); return { ok: true };
  });
  ipcMain.handle('seg:copiaProtegida', async (e, pw) => {
    if (!permite('respaldo', 'ver')) return { ok: false, err: 'Sin permiso' };
    if (String(pw || '').length < 8) return { ok: false, err: 'La contraseña de la copia debe tener al menos 8 caracteres' };
    const r = await dialog.showSaveDialog(win, { title: 'Guardar copia protegida', defaultPath: path.join(app.getPath('documents'), 'StockProject-protegida-' + new Date().toISOString().slice(0, 10) + '.spbak'), filters: [{ name: 'Copia protegida', extensions: ['spbak'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    try { fs.writeFileSync(r.filePath, store.snapshotProtegido(pw)); usr.audit(quien(), 'respaldo.exportar_protegido'); return { ok: true, file: r.filePath }; } catch (x) { return { ok: false, err: String(x.message || x) }; }
  });
  ipcMain.handle('seg:restaurarProtegida', async (e, pw) => {
    if (!permite('respaldo', 'eliminar')) return { ok: false, err: 'Sin permiso' };
    const r = await dialog.showOpenDialog(win, { title: 'Elegí la copia protegida', properties: ['openFile'], filters: [{ name: 'Copia protegida', extensions: ['spbak'] }] });
    if (r.canceled) return { ok: false };
    if (!store.esProtegido(r.filePaths[0])) return { ok: false, err: 'El archivo no es una copia protegida.' };
    if (!store.restoreFrom(r.filePaths[0], pw)) return { ok: false, err: 'Contraseña incorrecta o archivo dañado.' };
    usr.audit(quien(), 'respaldo.restaurar_protegido'); win.reload(); return { ok: true };
  });
  // Acceso remoto (celular u otras PC): mismo programa y mismos datos, protegido con clave.
  const remoto = require('./servidor').gestor({ store, usuarios: usr, integraciones: integ, certDir: path.join(ud, 'https'), indexPath: path.join(__dirname, 'index.html'), defaults: defaults() });
  const qrCache = {};
  ipcMain.handle('remote:info', async () => {
    const i = remoto.info();
    let qr = '';
    if (i.running && i.urls[0]) {
      try { qr = qrCache[i.urls[0]] || (qrCache[i.urls[0]] = await require('qrcode').toDataURL(i.urls[0], { margin: 1, width: 170 })); } catch (x) {}
    }
    return { ...i, qr };
  });
  ipcMain.handle('remote:set', (e, cfg) => { if (!permite('acceso_remoto', 'editar')) return remoto.info(); usr.audit(quien(), 'acceso_remoto.cambio', Object.keys(cfg || {}).join(',')); return remoto.setConfig(cfg || {}); });
  ipcMain.handle('b:export', async () => {
    if (!permite('respaldo', 'ver')) return { ok: false };
    const r = await dialog.showSaveDialog(win, { title: 'Guardar copia de seguridad', defaultPath: path.join(app.getPath('documents'), 'StockProject-copia-' + new Date().toISOString().slice(0, 10) + '.json'), filters: [{ name: 'Copia de StockProject', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    try { fs.writeFileSync(r.filePath, store.snapshot() || '{}'); usr.audit(quien(), 'respaldo.exportar'); return { ok: true, file: r.filePath }; } catch (x) { return { ok: false, err: String(x.message || x) }; }
  });
  if (!faltaClave) remoto.start();
  app.on('before-quit', () => { try { remoto.stop(); } catch (x) {} });
  crear();
  if (!faltaClave) store.backup();
  setInterval(() => { if (!faltaClave) store.backup(); }, 36e5);
});
app.on('before-quit', () => { try { store && !faltaClave && store.backup() } catch (e) {} });
app.on('window-all-closed', () => app.quit());
