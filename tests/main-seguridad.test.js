// Auditoría 16/11/2026: arranca main.js con un Electron simulado (carpeta temporal, sin ventana ni red) y prueba
// E1 (importar clave), E2 (permisos al guardar), E4 (marca de usuarios), E7 (datos antes de ingresar) y E9 (enlaces).
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-main-'));
const ud = path.join(tmp, 'userData');
fs.mkdirSync(ud, { recursive: true });
const resp = path.join(tmp, 'respaldos');   // carpeta de respaldos temporal: nunca la nube real de quien corre las pruebas
const cfgInicial = extra => fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify({ backupDir: resp, ...extra }));

function arrancar() {
  const h = {}, on = {}, abiertos = [], ventana = { pagina: '' };
  let abrirVentana = null;
  class BrowserWindow {
    constructor() { this.webContents = { on() {}, once() {}, send() {}, setWindowOpenHandler: f => { abrirVentana = f; }, session: { setPermissionRequestHandler() {} } }; }
    maximize() {} on() {} once() {} reload() {} destroy() {} isDestroyed() { return false; }
    loadFile(f) { ventana.pagina = path.basename(f); }
  }
  const app = { requestSingleInstanceLock: () => true, quit() {}, whenReady: () => Promise.resolve(), on() {}, getVersion: () => '0.0.0', isPackaged: false,
    getAppMetrics: () => [], getPath: k => (k === 'userData' ? ud : path.join(tmp, k)) };
  const electron = { app, BrowserWindow, Menu: { setApplicationMenu() {} }, dialog: {},
    ipcMain: { handle: (n, f) => { h[n] = f; }, on: (n, f) => { on[n] = f; } },
    shell: { openExternal: u => abiertos.push(u), openPath() {} },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('x' + s), decryptString: b => b.toString().slice(1) } };
  const orig = Module._load;
  Module._load = function (req, ...r) { if (req === 'electron') return electron; if (req === 'electron-updater') throw new Error('sin actualizador en pruebas'); return orig.call(this, req, ...r); };
  for (const k of Object.keys(require.cache)) if (!k.includes('node_modules')) delete require.cache[k];
  require('../main.js');
  Module._load = orig;
  const sync = (n, ...a) => { const e = {}; on[n](e, ...a); return e.returnValue; };
  return new Promise(res => setImmediate(() => res({ h, sync, abiertos, ventana, abrir: url => abrirVentana({ url }) })));
}
const datos = () => ({ prods: [{ id: 1, name: 'Yerba', price: 100, cost: 60, lots: [{ n: '', qty: 10, exp: '' }] }], sales: [{ id: 1, date: '2026-11-16T10:00:00.000Z', items: [{ id: 1, qty: 1, price: 100 }], total: 100, pay: 'Efectivo', caja: 1 }],
  cajas: [{ id: 1, uid: 2, ini: 0, movs: [] }], fin: { mov: [{ id: 1, monto: 5 }], pagar: [], emp: [], banco: [], id: 2 }, cfg: { cajaObligatoria: true }, pays: [], cargos: [], clients: [], rev: 0 });

(async () => {
  fs.writeFileSync(path.join(ud, 'stockproject-data.json'), JSON.stringify(datos())); cfgInicial();
  let m = await arrancar();

  // ---- E9: solo se abren afuera los enlaces que usa el programa ----
  ['https://wa.me/5491155551234?text=hola', 'https://api.whatsapp.com/send?text=x', 'mailto:ana@correo.com', 'https://stockprojectapp.vercel.app/c/x/', 'https://github.com/Titiconti/StockProject'].forEach(u => m.abrir(u));
  ['https://sitio-falso.com/pago', 'http://wa.me/x', 'https://wa.me.falso.com/', 'file:///C:/Windows/system32/calc.exe', 'https://github.com/otro/repo', 'https://github.com/Titiconti/../evil/repo', 'https://github.com/Titiconti/%2e%2e/evil'].forEach(u => m.abrir(u));
  assert.deepStrictEqual(m.abiertos, ['https://wa.me/5491155551234?text=hola', 'https://api.whatsapp.com/send?text=x', 'mailto:ana@correo.com', 'https://stockprojectapp.vercel.app/c/x/', 'https://github.com/Titiconti/StockProject']);

  // ---- E1: sin falta de clave, importar una clave no hace nada ni toca los datos ----
  const antes = fs.readFileSync(path.join(ud, 'stockproject-data.json'), 'utf8');
  const r1 = await m.h['seg:importarClave']({}, 'ab'.repeat(32));
  assert(!r1.ok, 'importarClave se rechaza si el equipo ya tiene la clave');
  assert.strictEqual(fs.readFileSync(path.join(ud, 'stockproject-data.json'), 'utf8'), antes, 'los datos quedan iguales');
  assert(!fs.existsSync(path.join(ud, 'clave-datos.bin')));

  // Modo de un solo usuario (sin usuarios): todo como siempre.
  assert(m.sync('load').includes('Yerba'));
  let o = JSON.parse(m.sync('load')); o.cfg.cajaObligatoria = false;
  assert((await m.h.save({}, JSON.stringify(o), m.sync('version'))).ok, 'sin usuarios se guarda cualquier cambio');
  assert((await m.h['b:info']()).dir, 'sin usuarios se ve la carpeta de respaldos');

  // ---- se crea el primer administrador y un empleado ----
  assert((await m.h['auth:call']({}, 'crear', [{ user: 'ana', rol: 'admin', clave: 'Clave1234' }])).ok);
  assert((await m.h['auth:call']({}, 'crear', [{ user: 'luis', rol: 'empleado', clave: 'Clave1234' }])).ok);
  assert(JSON.parse(fs.readFileSync(path.join(ud, 'config.json'), 'utf8')).usuariosActivos, 'marca en la configuración');
  assert(JSON.parse(fs.readFileSync(path.join(ud, 'stockproject-data.json'), 'utf8')).usuariosActivos, 'marca dentro de los datos');
  // V2: el cifrado lo maneja solo un administrador (aunque otro tenga usuarios.editar).
  assert((await m.h['auth:call']({}, 'crear', [{ user: 'gero', rol: 'gerente', clave: 'Clave1234', extra: ['usuarios.editar'] }])).ok);
  await m.h['auth:logout']();
  assert((await m.h['auth:login']({}, 'gero', 'Clave1234')).ok);
  assert(!(await m.h['seg:activar']()).ok && !(await m.h['seg:desactivar']()).ok, 'un gerente no toca el cifrado');
  assert(!fs.existsSync(path.join(ud, 'clave-datos.bin')));
  await m.h['auth:logout']();

  // ---- E7: antes de ingresar no se ven rutas, empresas ni el panel ----
  assert.strictEqual((await m.h['b:info']()).dir, '');
  assert.deepStrictEqual((await m.h['emp:listar']()).lista, []);
  assert.strictEqual(await m.h['sys:metricas'](), null);
  assert.strictEqual((await m.h['upd:estado']()).fase, 'inicial');
  assert.deepStrictEqual(await m.h['nube:estado'](), { activo: false });
  assert.strictEqual(m.sync('load'), '');

  // ---- E2: el empleado vende, pero no borra ventas ni cambia configuración o finanzas ----
  assert((await m.h['auth:login']({}, 'luis', 'Clave1234')).ok);
  assert((await m.h['b:info']()).dir, 'con sesión sí se ve');
  const prueba = async (f) => { const x = JSON.parse(m.sync('load')); f(x); return m.h.save({}, JSON.stringify(x), m.sync('version')); };
  let r = await prueba(x => { x.sales.push({ id: 2, date: new Date().toISOString(), items: [{ id: 1, qty: 1, price: 100 }], total: 100, pay: 'Efectivo', caja: 1 }); x.prods[0].lots[0].qty = 9; });
  assert(r.ok, 'el empleado registra una venta: ' + r.err);
  r = await prueba(x => { x.sales = x.sales.filter(s => s.id !== 1); }); assert(!r.ok && r.permiso, 'no borra ventas');
  r = await prueba(x => { x.sales.find(s => s.id === 1).void = true; }); assert(!r.ok && r.permiso, 'el empleado no anula una venta (IPC save)');
  r = await prueba(x => { x.sales.find(s => s.id === 1).total = 1; }); assert(!r.ok, 'el empleado no cambia el total de una venta');
  r = await prueba(x => { x.cfg.cajaObligatoria = true; x.cfg.moneda = 'USD'; }); assert(!r.ok && r.permiso, 'no cambia la configuración');
  r = await prueba(x => { x.fin.mov = []; }); assert(!r.ok && r.permiso, 'no borra finanzas');
  r = await prueba(x => { delete x.usuariosActivos; x.cfg.nroComp = 2; }); assert(r.ok, r.err);
  assert(JSON.parse(fs.readFileSync(path.join(ud, 'stockproject-data.json'), 'utf8')).usuariosActivos, 'un guardado no borra la marca');
  await m.h['auth:logout']();
  assert((await m.h['auth:login']({}, 'ana', 'Clave1234')).ok);
  r = await prueba(x => { x.fin.mov = []; x.cfg.moneda = 'USD'; }); assert(r.ok, 'el administrador sí: ' + r.err);
  r = await prueba(x => { x.sales.find(s => s.id === 1).void = true; }); assert(r.ok, 'el administrador anula una venta: ' + r.err);
  await m.h['auth:logout']();

  // ---- E4: se borra usuarios.json y se reabre el programa: no queda libre ----
  fs.unlinkSync(path.join(ud, 'usuarios.json'));
  m = await arrancar();
  assert.strictEqual(m.ventana.pagina, 'login.html', 'sigue pidiendo ingresar');
  assert(m.sync('auth:estado').faltanUsuarios);
  assert.strictEqual(m.sync('load'), '');
  assert(!(await m.h['auth:call']({}, 'crear', [{ user: 'intruso', rol: 'admin', clave: 'Clave1234' }])).ok);
  assert(!(await m.h['seg:desactivar']()).ok, 'sin sesión no hay permisos');
  // También si además se borra config.json (la marca sigue dentro de los datos).
  cfgInicial();   // config.json nueva, sin la marca (la marca sigue dentro de los datos)
  m = await arrancar();
  assert.strictEqual(m.ventana.pagina, 'login.html');

  // ---- E1 con cifrado: la clave se prueba sin reescribir; una equivocada no cambia nada ----
  const crypto = require('crypto'), k = crypto.randomBytes(32);
  require('../store.js')({ dataFile: path.join(ud, 'stockproject-data.json'), configFile: path.join(ud, 'config.json'), docsDir: tmp, home: tmp }).setKey(k);
  cfgInicial({ cifrado: true });
  m = await arrancar();
  assert.strictEqual(m.ventana.pagina, 'clave.html');
  const cifrado = fs.readFileSync(path.join(ud, 'stockproject-data.json'), 'utf8');
  r = await m.h['seg:importarClave']({}, crypto.randomBytes(32).toString('hex'));
  assert(!r.ok && fs.readFileSync(path.join(ud, 'stockproject-data.json'), 'utf8') === cifrado, 'una clave equivocada no reescribe los datos');
  r = await m.h['seg:importarClave']({}, k.toString('hex'));
  assert(r.ok, 'la clave buena abre los datos');
  assert(!(await m.h['seg:importarClave']({}, crypto.randomBytes(32).toString('hex'))).ok, 'después ya no se acepta otra clave');
  assert.strictEqual(m.ventana.pagina, 'login.html', 'la marca dentro de los datos cifrados sigue pidiendo ingresar');
  console.log('main-seguridad: ok');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
