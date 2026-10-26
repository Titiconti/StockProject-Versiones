const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path'), fs = require('fs');
if (!app.requestSingleInstanceLock()) app.quit();
let win, store;
const defaults = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8')) } catch (e) { return {} } };

function crear() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1280, height: 800, title: 'StockProject', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.maximize();
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  const ud = app.getPath('userData');
  store = require('./store')({ dataFile: path.join(ud, 'stockproject-data.json'), configFile: path.join(ud, 'config.json'),
    docsDir: app.getPath('documents'), home: app.getPath('home'), defaults: defaults() });
  ipcMain.on('load', e => { try { e.returnValue = store.load() } catch (x) { e.returnValue = '' } });
  try { store.load(); } catch (x) {}   // inicializa la versión de los datos antes de abrir el acceso remoto
  ipcMain.handle('save', (e, s, base) => { try { return store.put(s, base) } catch (x) { return { ok: false, err: String((x && x.message) || x) } } });
  ipcMain.on('version', e => { e.returnValue = store.rev(); });
  ipcMain.on('defaults', e => { e.returnValue = defaults() });
  ipcMain.handle('b:info', () => store.info());
  ipcMain.handle('b:now', () => store.backup());
  ipcMain.handle('b:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Elegí la carpeta de respaldo', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return store.info();
    store.setDir(r.filePaths[0]);
    return store.backup();
  });
  ipcMain.handle('b:restore', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Elegí la copia a restaurar', properties: ['openFile'],
      filters: [{ name: 'Copia de StockProject', extensions: ['json'] }], defaultPath: store.info().dir });
    if (r.canceled) return false;
    const c = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Restaurar', 'Cancelar'], defaultId: 1, cancelId: 1,
      message: 'Se van a reemplazar los datos actuales por los de esta copia.', detail: 'Antes se guarda una copia de los datos actuales, por seguridad.' });
    if (c.response !== 0) return false;
    if (store.restoreFrom(r.filePaths[0])) { win.reload(); return true; }
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
  // Acceso remoto (celular u otras PC): mismo programa y mismos datos, protegido con clave.
  const remoto = require('./servidor').gestor({ store, indexPath: path.join(__dirname, 'index.html'), defaults: defaults() });
  const qrCache = {};
  ipcMain.handle('remote:info', async () => {
    const i = remoto.info();
    let qr = '';
    if (i.running && i.urls[0]) {
      try { qr = qrCache[i.urls[0]] || (qrCache[i.urls[0]] = await require('qrcode').toDataURL(i.urls[0], { margin: 1, width: 170 })); } catch (x) {}
    }
    return { ...i, qr };
  });
  ipcMain.handle('remote:set', (e, cfg) => remoto.setConfig(cfg || {}));
  ipcMain.handle('b:export', async () => {
    const r = await dialog.showSaveDialog(win, { title: 'Guardar copia de seguridad', defaultPath: path.join(app.getPath('documents'), 'StockProject-copia-' + new Date().toISOString().slice(0, 10) + '.json'), filters: [{ name: 'Copia de StockProject', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    try { fs.writeFileSync(r.filePath, store.snapshot() || '{}'); return { ok: true, file: r.filePath }; } catch (x) { return { ok: false, err: String(x.message || x) }; }
  });
  remoto.start();
  app.on('before-quit', () => { try { remoto.stop(); } catch (x) {} });
  crear();
  store.backup();
  setInterval(() => store.backup(), 36e5);
});
app.on('before-quit', () => { try { store && store.backup() } catch (e) {} });
app.on('window-all-closed', () => app.quit());
