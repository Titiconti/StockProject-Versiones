const { app, BrowserWindow, Menu, ipcMain, dialog, shell, safeStorage } = require('electron');
const crypto = require('crypto');
const path = require('path'), fs = require('fs');
if (!app.requestSingleInstanceLock()) app.quit();
let win, store;
const defaults = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8')) } catch (e) { return {} } };

let usr, emp, upd, tok = null;                                   // usuarios y sesión de esta ventana (el token nunca llega a la interfaz)
const quien = () => (usr && usr.habilitado() ? usr.sesion(tok) : null);
const permite = (m, a) => !usr.habilitado() || usr.tiene(quien(), m, a);
const esAdminSesion = () => !usr.habilitado() || !!(quien() && quien().rol === 'admin');   // el cifrado lo maneja solo un administrador
const conSesion = () => !usr.habilitado() || !!quien();          // datos del equipo (rutas, empresas, panel): no se muestran antes de ingresar
const autorizar = require('./permisos-datos');
// Enlaces que el programa abre afuera (WhatsApp, correo, el panel y las novedades del proyecto). Nada más.
const ENLACES = [/^mailto:/i, /^https:\/\/wa\.me\//i, /^https:\/\/api\.whatsapp\.com\//i, /^https:\/\/stockprojectapp\.vercel\.app(\/|$)/i, /^https:\/\/github\.com\/Titiconti\/(?!.*(\.\.|%2e))/i];
const enlacePermitido = url => ENLACES.some(r => r.test(String(url || '')));
let faltaClave = false;                               // datos cifrados y sin la clave de este equipo: se pide la clave de recuperación
const pagina = () => path.join(__dirname, faltaClave ? 'clave.html' : usr.habilitado() && !quien() ? 'login.html' : 'index.html');

function crear() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1280, height: 800, title: 'StockProject', autoHideMenuBar: true, show: false, backgroundColor: '#12233D',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false } });
  win.once('ready-to-show', () => win.maximize());   // la ventana aparece (maximizada) recién con el primer cuadro pintado
  // Caja abierta al cerrar la ventana: la página frena el cierre y acá se pregunta. Al cambiar de página (ingresar, salir) no se pregunta.
  let cerrando = false;
  win.on('close', () => { cerrando = true; });
  win.webContents.on('will-prevent-unload', e => {
    if (!cerrando) return e.preventDefault();
    cerrando = false;
    const r = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['Cerrar la caja', 'Salir igual'], defaultId: 0, cancelId: 0, title: 'StockProject',
      message: 'Tenés la caja abierta', detail: 'Conviene cerrarla contando el efectivo. Si salís igual, la caja queda abierta y la retomás al volver a entrar.' });
    if (r === 1) e.preventDefault();
    // En Windows, tras el cartel nativo la ventana queda sin foco de teclado (los campos no dejan escribir): se lo devolvemos.
    else setTimeout(() => { if (!win.isDestroyed()) { win.blur(); win.focus(); win.webContents.focus(); } }, 0);   // solo focus() no alcanza: hace falta blur() antes
  });
  // enlaces de WhatsApp, correo o pago: se abren en el programa predeterminado de Windows, nunca dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => { if (enlacePermitido(url)) shell.openExternal(url); return { action: 'deny' }; });
  // La ventana solo muestra las páginas del programa: no navega a sitios ni archivos externos, no incrusta webviews
  // y no concede permisos del navegador (cámara, micrófono, ubicación, notificaciones web, etc.).
  const propia = url => { try { const u = new URL(url); return u.protocol === 'file:' && path.normalize(decodeURIComponent(u.pathname.replace(/^\/([A-Za-z]:)/, '$1'))).toLowerCase().startsWith(path.normalize(__dirname).toLowerCase()); } catch (e) { return false; } };
  win.webContents.on('will-navigate', (e, url) => { if (!propia(url)) e.preventDefault(); });
  win.webContents.on('will-attach-webview', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((wc, permiso, cb) => cb(permiso === 'clipboard-sanitized-write'));   // solo copiar al portapapeles (botón "Copiar mensaje")
  win.loadFile(pagina());
}

app.whenReady().then(() => {
  const ud = app.getPath('userData');
  const opcionesStore = { docsDir: app.getPath('documents'), home: app.getPath('home'), defaults: defaults() };
  const principal = require('./store')({ dataFile: path.join(ud, 'stockproject-data.json'), configFile: path.join(ud, 'config.json'), ...opcionesStore });
  // Varias empresas: `store` apunta siempre a la empresa activa (el resto del programa no se entera del cambio).
  emp = require('./empresas')({ dir: ud, principal, crearStore: o => require('./store')(o), opcionesComunes: opcionesStore });
  store = new Proxy({}, { get: (_, k) => { const s = emp.activa(), v = s[k]; return typeof v === 'function' ? v.bind(s) : v; } });
  // Cifrado en reposo (opcional): la clave vive en este equipo protegida por Windows (DPAPI) y se puede recuperar con la clave de respaldo.
  const keyFile = path.join(ud, 'clave-datos.bin'), cfgS = () => principal.getConfig();
  const guardarClave = k => fs.writeFileSync(keyFile, safeStorage.encryptString(k.toString('hex')));
  const leerClave = () => { try { return Buffer.from(safeStorage.decryptString(fs.readFileSync(keyFile)), 'hex'); } catch (x) { return null; } };
  if (cfgS().cifrado) { const k = safeStorage.isEncryptionAvailable() ? leerClave() : null; if (k && k.length === 32) emp.setKey(k); else faltaClave = true; }
  // Marca de "usuarios activados" en config.json y dentro de los datos (cifrados si corresponde): si después falta
  // usuarios.json, el programa no queda abierto para todos (E4).
  let marca = !!cfgS().usuariosActivos || (!faltaClave && principal.marcaUsuarios());
  usr = require('./usuarios')({ usersFile: path.join(ud, 'usuarios.json'), auditFile: path.join(ud, 'auditoria.jsonl'), marcado: () => marca });
  const marcar = () => { if (!usr.habilitado() || usr.faltanUsuarios()) return; if (!cfgS().usuariosActivos) principal.setConfig({ usuariosActivos: true }); if (!faltaClave) principal.marcarUsuarios(); marca = true; };
  if (usr.habilitado() && !usr.faltanUsuarios()) marcar();
  ipcMain.on('load', e => { try { e.returnValue = usr.habilitado() && !quien() ? '' : store.load() } catch (x) { e.returnValue = '' } });
  ipcMain.on('auth:estado', e => { e.returnValue = usr.llamar(tok, 'estado'); });
  ipcMain.handle('auth:call', (e, nombre, args) => {
    if (!usr.NOMBRES.includes(nombre)) return { ok: false };
    const primero = nombre === 'crear' && !usr.habilitado();
    const r = usr.llamar(tok, nombre, Array.isArray(args) ? args : []);
    if (primero && r.ok) { marcar(); const l = usr.login(args[0].user, args[0].clave, 'Escritorio'); if (l.ok) tok = l.token; }
    return r;
  });
  ipcMain.handle('auth:login', (e, u, c) => { const r = usr.login(u, c, 'Escritorio'); if (!r.ok) return r; tok = r.token; setTimeout(() => win.loadFile(pagina()), 220); return { ok: true }; });   // 220 ms: login.html apaga la tarjeta antes de cambiar de página
  ipcMain.handle('auth:logout', () => { usr.logout(tok); tok = null; win.loadFile(pagina()); return { ok: true }; });
  ipcMain.handle('auth:ir', () => { win.loadFile(pagina()); return true; });
  if (!faltaClave) try { store.load(); } catch (x) {}   // inicializa la versión de los datos
  const avisarNube = r => { if (r && r.ok) { try { nube.avisar(); } catch (e) {} } return r; };   // despierta la sincronización rápida al guardar
  ipcMain.handle('save', (e, s, base) => { try { if (usr.habilitado()) { const q = quien(); if (!q) return { ok: false, auth: true, err: 'La sesión venció: volvé a ingresar' }; if (!usr.puedeEscribir(q)) return { ok: false, err: 'Tu usuario es de solo consulta' }; if (!usr.puedePrecios(q) && usr.cambiaPrecios(store.load(), s)) return { ok: false, err: 'Solo el gerente o el administrador pueden cambiar precios' }; return avisarNube(store.put(s, base, (prev, o) => autorizar(prev, o, (m, a) => usr.tiene(q, m, a)))); } return avisarNube(store.put(s, base)) } catch (x) { return { ok: false, err: String((x && x.message) || x) } } });
  ipcMain.on('version', e => { e.returnValue = store.rev(); });
  ipcMain.on('defaults', e => { e.returnValue = defaults() });
  const sinInfo = { dir: '', last: null, warn: '' };
  ipcMain.handle('xlsx:leer', async (e, buf) => { try { return await require('./xlsx-lector').leerXlsx(buf) } catch (x) { return { err: 'No se pudo leer el .xlsx' } } });
  ipcMain.handle('b:info', () => conSesion() ? store.info() : sinInfo);
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
  // Empresas y tipos de cambio
  const sinPermiso = { ok: false, err: 'Solo un administrador puede cambiar esto' };
  ipcMain.handle('emp:listar', () => conSesion() ? emp.listar() : { activa: '', lista: [] });
  ipcMain.handle('emp:crear', (e, n) => { if (!permite('configuracion', 'editar')) return sinPermiso; const r = emp.crear(n); if (r.ok) usr.audit(quien(), 'empresa.crear', n); return r; });
  ipcMain.handle('emp:renombrar', (e, id, n) => permite('configuracion', 'editar') ? emp.renombrar(id, n) : sinPermiso);
  ipcMain.handle('emp:cambiar', (e, id) => {
    if (!permite('configuracion', 'editar')) return sinPermiso;
    const r = emp.cambiar(id); if (!r.ok) return r;
    try { store.load(); } catch (x) {} usr.audit(quien(), 'empresa.cambiar', id); win.loadFile(pagina()); return { ok: true };
  });
  ipcMain.handle('emp:consolidado', (e, o) => permite('reporte', 'ver') && permite('configuracion', 'ver') ? emp.consolidado({ desde: String(o.desde), hasta: String(o.hasta), base: String(o.base), estado: o.estado || {} }) : null);
  ipcMain.handle('fx:actualizar', async (e, base) => permite('configuracion', 'editar') ? require('./monedas').actualizar((...a) => fetch(...a), base) : sinPermiso);
  ipcMain.handle('sys:metricas', () => {
    if (!conSesion()) return null;
    const m = app.getAppMetrics(), os = require('os'), inf = store.info();
    return { cpu: Math.round(m.reduce((a, x) => a + ((x.cpu && x.cpu.percentCPU) || 0), 0) * 10) / 10, memMB: Math.round(m.reduce((a, x) => a + ((x.memory && x.memory.workingSetSize) || 0), 0) / 1024), libreMB: Math.round(os.freemem() / 1048576), archivoMB: Math.round(store.tam() / 1048576 * 100) / 100, iniciada: Math.round(process.uptime()), ultimoRespaldo: inf.last, rev: store.rev() };
  });
  // Actualizaciones automáticas (GitHub Releases del repositorio configurado en package.json)
  let au = null; try { au = require('electron-updater').autoUpdater; } catch (x) {}
  upd = require('./actualizador')({ autoUpdater: au, version: app.getVersion(), empaquetada: app.isPackaged && !!au,
    alEstado: e => { if (win && !win.isDestroyed()) win.webContents.send('upd:estado', e); },
    antesDeInstalar: () => { try { store.backup(); } catch (x) {} usr.audit(quien(), 'actualizacion.instalar', ''); },
    activo: () => principal.getConfig().actualizar !== false });
  const sinUpd = { fase: 'inicial', version: '', nueva: null, pct: 0, msg: '', ultima: null, auto: false };
  const autoOn = () => principal.getConfig().actualizar !== false;
  ipcMain.handle('upd:estado', () => conSesion() ? { ...upd.estado(), auto: autoOn() } : sinUpd);
  ipcMain.handle('upd:buscar', async () => conSesion() ? { ...(await upd.buscar()), auto: autoOn() } : sinUpd);
  ipcMain.handle('upd:instalar', () => permite('configuracion', 'editar') ? upd.instalar() : sinPermiso);
  ipcMain.handle('upd:auto', (e, v) => { if (!permite('configuracion', 'editar')) return sinPermiso; principal.setConfig({ actualizar: !!v }); return { ok: true }; });
  upd.iniciar();
  ipcMain.handle('seg:estado', () => ({ disponible: safeStorage.isEncryptionAvailable(), activo: !!cfgS().cifrado, falta: faltaClave, cifrado: store.cifrado() }));
  ipcMain.handle('seg:activar', () => {
    if (!esAdminSesion()) return { ok: false, err: 'Solo un administrador puede cambiar el cifrado' };
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, err: 'Este equipo no permite proteger la clave (Windows no la ofrece).' };
    const k = crypto.randomBytes(32); guardarClave(k); principal.setConfig({ cifrado: true }); emp.setKey(k); store.backup();
    usr.audit(quien(), 'seguridad.cifrado_on'); return { ok: true, clave: k.toString('hex') };
  });
  ipcMain.handle('seg:desactivar', () => {
    if (!esAdminSesion()) return { ok: false, err: 'Solo un administrador puede cambiar el cifrado' };
    emp.setKey(null); principal.setConfig({ cifrado: false }); try { fs.unlinkSync(keyFile); } catch (x) {} store.backup();
    usr.audit(quien(), 'seguridad.cifrado_off'); return { ok: true };
  });
  // Solo sirve en la pantalla de recuperación (falta la clave de este equipo). La clave se prueba sin reescribir los datos (E1).
  ipcMain.handle('seg:importarClave', (e, hex) => {
    if (!faltaClave) return { ok: false, err: 'Este equipo ya tiene la clave de los datos.' };
    const h = String(hex || '').replace(/[^0-9a-f]/gi, '');
    if (h.length !== 64) return { ok: false, err: 'La clave de recuperación tiene 64 caracteres (letras de la A a la F y números).' };
    if (!store.probarClave(Buffer.from(h, 'hex'))) return { ok: false, err: 'Esa clave no abre los datos.' };
    emp.setKey(Buffer.from(h, 'hex'));
    guardarClave(Buffer.from(h, 'hex')); faltaClave = false; store.load(); if (principal.marcaUsuarios()) marca = true; usr.audit(null, 'seguridad.clave_recuperada'); win.loadFile(pagina()); return { ok: true };
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
  // Facturación electrónica con ARCA: la clave privada y el certificado de cada empresa viven en este equipo (protegidos por Windows) y solo este proceso habla con ARCA.
  const arcas = new Map(), soloAdmin = () => permite('usuarios', 'editar');
  const arca = () => { const id = emp.listar().activa; if (!arcas.has(id)) arcas.set(id, require('./arca')({ archivo: path.join(ud, 'arca-' + id + '.json'),
    proteger: t => { if (!safeStorage.isEncryptionAvailable()) throw new Error('Este equipo no permite proteger la clave privada (Windows no la ofrece).'); return 'ss:' + safeStorage.encryptString(t).toString('base64'); },
    desproteger: t => safeStorage.decryptString(Buffer.from(String(t).slice(3), 'base64')),
    post: async (url, o) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"' + o.soapAction + '"' }, body: o.body, signal: AbortSignal.timeout(o.timeoutMs) }); return { status: r.status, text: await r.text() }; } })); return arcas.get(id); };
  const sinAdmin = { ok: false, err: 'Solo un administrador puede configurar ARCA' };
  ipcMain.handle('arca:estado', () => ({ ...arca().estado(), admin: soloAdmin() }));
  ipcMain.handle('arca:config', (e, p) => { if (!soloAdmin()) return sinAdmin; const r = arca().guardarConfig(p); if (r.ok) usr.audit(quien(), 'arca.config', String(p && p.ambiente || '')); return r; });
  ipcMain.handle('arca:csr', (e, o) => { if (!soloAdmin()) return sinAdmin; try { const r = arca().generarCsr(o || {}); if (r.ok) usr.audit(quien(), 'arca.csr'); return r; } catch (x) { return { ok: false, err: String(x.message || x) }; } });
  ipcMain.handle('arca:cert', (e, t, amb) => { if (!soloAdmin()) return sinAdmin; const r = arca().cargarCertificado(t, amb); if (r.ok) usr.audit(quien(), 'arca.certificado'); return r; });
  ipcMain.handle('arca:probar', () => soloAdmin() ? arca().probar() : sinAdmin);
  ipcMain.handle('arca:tipos', () => soloAdmin() ? arca().tipos() : sinAdmin);
  ipcMain.handle('arca:facturar', async (e, id, receptor) => {
    if (!permite('ventas', 'crear')) return { ok: false, err: 'Tu usuario no puede facturar' };
    let venta; try { venta = (JSON.parse(store.snapshot() || '{}').sales || []).find(s => s.id === id); } catch (x) {}
    if (!venta || venta.void) return { ok: false, err: 'La venta no existe o está anulada' };
    const r = await arca().facturar({ id: venta.id, date: venta.date, total: venta.total, receptor });
    if (r.ok && !r.repetido) usr.audit(quien(), 'arca.facturar', 'venta ' + id + ' ' + r.fe.letra + ' ' + String(r.fe.ptoVta).padStart(4, '0') + '-' + String(r.fe.nro).padStart(8, '0'));
    return r;
  });
  ipcMain.handle('arca:anular', async (e, id) => {   // anular una venta facturada = emitir la nota de crédito (solo gerente o administrador)
    if (!permite('ventas', 'eliminar')) return { ok: false, err: 'Solo un gerente o un administrador puede anular una venta facturada' };
    let venta; try { venta = (JSON.parse(store.snapshot() || '{}').sales || []).find(s => s.id === id); } catch (x) {}
    if (!venta || !venta.fe || !venta.fe.cae) return { ok: false, err: 'La venta no tiene una factura autorizada' };
    const r = await arca().notaCredito({ id: venta.id, date: venta.date, total: venta.total }, venta.fe);
    if (r.ok && !r.repetido) usr.audit(quien(), 'arca.nota_credito', 'venta ' + id + ' NC ' + r.fe.letra + ' ' + String(r.fe.ptoVta).padStart(4, '0') + '-' + String(r.fe.nro).padStart(8, '0'));
    return r;
  });
  ipcMain.handle('arca:qr', (e, url) => { try { return String(url).startsWith(require('./arca').QR_URL) ? require('./arca').qrSvg(url) : ''; } catch (x) { return ''; } });  // Panel para el celular desde cualquier lugar: envío de datos de solo lectura al servidor central (nube.js).
  // Cambios de precio pedidos por el dueño desde el celular: nube.js trae el pedido autenticado con el token de esta instalación y
  // se aplica ACÁ, en el proceso principal, con la autoridad del dueño (no la del usuario que tenga la sesión abierta en la PC). La
  // ventana no decide nada ni puede crear pedidos (no hay ningún canal de la ventana hacia acá): solo recibe el aviso para refrescar.
  const aplicadorPrecios = require('./precios-remoto')({ leer: () => store.snapshot(), guardar: (s, base) => store.put(s, base), rev: () => store.rev() });
  const aplicarPrecios = lista => {
    let r; try { r = aplicadorPrecios(lista); } catch (x) { r = null; }
    if (!r) return null;
    r.resultados.forEach(x => usr.audit({ id: null, user: 'dueño desde el celular' }, 'precio.celular', x.id + ': ' + x.estado + (x.motivo ? ' (' + x.motivo + ')' : '')));
    if (r.cambios.length && win && !win.isDestroyed()) win.webContents.send('precios:cambiados', { cambios: r.cambios, rev: r.rev, ajustes: r.ajustes, ajid: r.ajid, preciosCel: r.preciosCel });
    return r.resultados;
  };
  const nube = require('./nube')({ aplicar: aplicarPrecios, leer: () => store.snapshot(), getCfg: () => principal.getConfig(), setCfg: p => principal.setConfig(p), servidor: defaults().nube || '',
    proteger: t => safeStorage.isEncryptionAvailable() ? 'ss:' + safeStorage.encryptString(t).toString('base64') : t,
    desproteger: t => String(t).startsWith('ss:') ? safeStorage.decryptString(Buffer.from(String(t).slice(3), 'base64')) : t });
  ipcMain.handle('nube:estado', () => conSesion() ? nube.estado() : { activo: false });
  ipcMain.on('nube:online', () => { try { nube.reintentarYa(); } catch (e) {} });
  ipcMain.handle('nube:call', async (e, n, a) => {
    if (!permite('acceso_remoto', 'editar')) return { ok: false, err: 'Tu usuario no tiene permiso para cambiar el acceso remoto' };
    const f = { configurar: nube.configurar, activar: nube.activar, quitar: nube.quitar, registrar: a => a && typeof a === 'object' ? nube.registrar(a.nombre, a.clave) : nube.registrar(a), cambiarClave: nube.cambiarClave, clave: async () => ({ ok: true, clave: nube.clave() }), ahora: () => nube.sincronizar(true) }[n]; if (!f) return { ok: false };
    const r = await f(a); if (n !== 'clave') usr.audit(quien(), 'nube.' + n, ''); if (n === 'configurar' && r && r.ok) { nube.detener(); nube.iniciar(); }
    return r;
  });
  nube.iniciar(); app.on('before-quit', () => nube.detener());
  // Cobro con Mercado Pago (cuenta del comercio). El token se guarda cifrado con Windows y nunca llega a la interfaz.
  const mp = require('./mercadopago').crear({ getCfg: () => principal.getConfig(), setCfg: p => principal.setConfig(p), leer: () => store.snapshot(),
    proteger: t => { if (!safeStorage.isEncryptionAvailable()) throw new Error('sin cifrado'); return 'ss:' + safeStorage.encryptString(t).toString('base64'); },
    desproteger: t => safeStorage.decryptString(Buffer.from(String(t).slice(3), 'base64')),
    qr: d => { const q = require('qrcode-generator')(0, 'M'); q.addData(String(d)); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } });
  const sinVender = { ok: false, err: 'Tu usuario no puede cobrar' };
  const admin = (n, f) => ipcMain.handle('mp:' + n, async (e, a) => { if (!permite('usuarios', 'editar')) return { ok: false, err: 'Solo un administrador puede cambiar Mercado Pago' }; usr.audit(quien(), 'mp.' + n); return f(a); });
  admin('guardar', a => mp.guardar(a)); admin('quitar', () => mp.quitar()); admin('probar', () => mp.probar()); admin('terminales', () => mp.terminales());
  ipcMain.handle('mp:estado', () => mp.estado());
  ipcMain.handle('mp:cobrar', (e, a) => permite('ventas', 'crear') ? mp.cobrar(a || {}) : sinVender);
  ipcMain.handle('mp:consultar', (e, o) => permite('ventas', 'crear') ? mp.consultar(String(o)) : sinVender);
  ipcMain.handle('mp:cancelar', (e, o) => permite('ventas', 'crear') ? mp.cancelar(String(o)) : sinVender);
  ipcMain.handle('mp:conciliar', (e, d) => permite('reporte', 'ver') ? mp.conciliar(String(d)) : { ok: false, err: 'Tu usuario no puede ver reportes' });
  ipcMain.handle('b:export', async () => {
    if (!permite('respaldo', 'ver')) return { ok: false };
    const r = await dialog.showSaveDialog(win, { title: 'Guardar copia de seguridad', defaultPath: path.join(app.getPath('documents'), 'StockProject-copia-' + new Date().toISOString().slice(0, 10) + '.json'), filters: [{ name: 'Copia de StockProject', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    try { fs.writeFileSync(r.filePath, store.snapshot() || '{}'); usr.audit(quien(), 'respaldo.exportar'); return { ok: true, file: r.filePath }; } catch (x) { return { ok: false, err: String(x.message || x) }; }
  });
  crear();
  if (!faltaClave) store.backup();
  setInterval(() => { if (!faltaClave) store.backup(); }, 36e5);
});
app.on('before-quit', () => { try { store && !faltaClave && store.backup() } catch (e) {} });
app.on('window-all-closed', () => app.quit());
