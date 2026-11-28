// Seguridad de costos, márgenes y permisos finos: modelo de permisos, migración, datos que recibe cada usuario,
// rechazo de guardados en el proceso principal, exportaciones, auditoría y pantallas (jsdom).
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), Module = require('module');
const U = require('../usuarios.js'), autorizar = require('../permisos-datos.js'), costos = require('../permisos-costos.js');
const { JSDOM, HTML, until, api } = require('./helpers.js');
const usr = (rol, extra = [], deny = []) => ({ activo: true, rol, extra, deny });
const tiene = (u, k) => U.tiene(u, k.split('.')[0], k.split('.')[1]);

// ---- 1. Modelo de permisos y migración ----
const FINOS = ['costos.ver', 'costos.editar', 'margenes.ver', 'margenes.editar', 'rentabilidad.ver', 'proveedores.ver', 'proveedores.editar', 'precios.editar', 'descuentos.crear', 'anulacion.crear', 'anulacion.editar', 'caja.ver', 'caja.crear', 'caja.editar'];
FINOS.forEach(k => { assert(tiene(usr('admin'), k) && tiene(usr('gerente'), k), 'admin y gerente conservan ' + k); });
['costos.ver', 'costos.editar', 'margenes.ver', 'margenes.editar', 'rentabilidad.ver'].forEach(k => assert(!tiene(usr('empleado'), k) && !tiene(usr('consulta'), k), 'empleado y consulta no ven ' + k));
// Los empleados existentes no ganan acceso: solo conservan lo que ya podían hacer.
['precios.editar', 'descuentos.crear', 'proveedores.ver', 'proveedores.editar', 'caja.crear'].forEach(k => assert(tiene(usr('empleado'), k), 'empleado conserva ' + k));
assert(!tiene(usr('empleado'), 'caja.ver') && !tiene(usr('empleado'), 'caja.editar'), 'el empleado opera la caja pero no ve el arqueo ni corrige cierres');
['anulacion.crear', 'anulacion.editar', 'precios.editar', 'descuentos.crear', 'caja.crear', 'caja.editar'].forEach(k => assert(!tiene(usr('consulta'), k), 'consulta sigue sin ' + k));
assert(!tiene(usr('empleado'), 'anulacion.crear'), 'el empleado sigue sin anular');
// Usuarios guardados antes de esta versión (extra / deny viejos) mantienen lo suyo.
assert(tiene(usr('empleado', ['ventas.eliminar']), 'anulacion.crear') && tiene(usr('empleado', ['ventas.eliminar']), 'anulacion.editar'), 'extra ventas.eliminar sigue anulando');
assert(!tiene(usr('empleado', [], ['productos.editar']), 'precios.editar'), 'sin productos.editar no cambia precios');
// Un gerente puede cambiar precios sin ver costo ni margen.
const gerSinCosto = usr('gerente', [], ['costos.ver', 'costos.editar', 'margenes.ver', 'margenes.editar', 'rentabilidad.ver']);
assert(tiene(gerSinCosto, 'precios.editar') && !tiene(gerSinCosto, 'costos.ver') && !tiene(gerSinCosto, 'margenes.ver') && !tiene(gerSinCosto, 'rentabilidad.ver'));
// Un usuario inactivo no tiene nada; la matriz que ve la interfaz incluye los permisos finos.
assert(!U.tiene({ ...usr('admin'), activo: false }, 'costos', 'ver'));
assert.deepStrictEqual(U.matriz(usr('empleado')).costos, []); assert(U.matriz(usr('gerente')).costos.includes('ver'));

// ---- 2. Rechazo de guardados (permisos-datos) ----
const copia = o => JSON.parse(JSON.stringify(o)), con = (b, f) => { const o = copia(b); f(o); return o; };
const T = u => (m, a) => U.tiene(u, m, a);
const base = { prods: [{ id: 1, name: 'Yerba', price: 100, cost: 60, lots: [] }], sales: [{ id: 1, date: '2026-11-16T10:00:00.000Z', items: [{ id: 1, qty: 1, price: 100, cost: 60 }], total: 100, pay: 'Efectivo' }], cajas: [], cfg: {} };
const cambiaCosto = con(base, o => { o.prods[0].cost = 10; }), cambiaPrecio = con(base, o => { o.prods[0].price = 120; });
assert(autorizar(base, cambiaCosto, T(usr('empleado'))), 'el empleado no cambia costos');
assert.strictEqual(autorizar(base, cambiaPrecio, T(usr('empleado'))), null, 'el empleado conserva el cambio de precio');
assert.strictEqual(autorizar(base, cambiaPrecio, T(gerSinCosto)), null, 'el gerente sin costo cambia el precio de venta');
assert(autorizar(base, cambiaCosto, T(gerSinCosto)), 'el gerente sin costos.editar no cambia costos');
assert(autorizar(base, con(base, o => { o.prods[0].margen = 30; }), T(gerSinCosto)), 'ni márgenes');
assert(autorizar(base, cambiaPrecio, T(usr('gerente', [], ['precios.editar']))), 'sin precios.editar no cambia el precio');
assert.strictEqual(autorizar(base, cambiaCosto, T(usr('gerente'))), null);
assert(autorizar(base, con(base, o => { o.prods.push({ id: 2, name: 'Nuevo', price: 5, cost: 3, lots: [] }); }), T(usr('empleado'))), 'un producto nuevo con costo requiere costos.editar');
assert.strictEqual(autorizar(base, con(base, o => { o.prods.push({ id: 2, name: 'Nuevo', price: 5, cost: 0, lots: [] }); }), T(usr('empleado'))), null);
assert(autorizar(base, con(base, o => { o.sales[0].void = true; }), T(usr('gerente', [], ['anulacion.crear']))), 'sin anulacion.crear no anula');
assert.strictEqual(autorizar(base, con(base, o => { o.sales[0].void = true; }), T(usr('gerente', [], ['anulacion.editar']))), null, 'anular y corregir son permisos distintos');
assert(autorizar(base, con(base, o => { o.sales = []; }), T(usr('gerente', [], ['anulacion.editar']))), 'borrar una venta es corregirla');
assert(autorizar(base, con(base, o => { o.sales.push({ id: 2, date: '2026-11-16T11:00:00.000Z', items: [{ id: 1, qty: 1, price: 90 }], total: 90, pay: 'Efectivo', cid: 1, disc: 10 }); }), T(usr('gerente', [], ['descuentos.crear']))), 'sin descuentos.crear no vende con descuento');

const conCierre = con(base, o => { o.cajas = [{ id: 1, uid: 2, ini: 0, movs: [], cierre: '2026-11-16T20:00:00.000Z', contado: 0, dif: 0 }]; });
const cierreCorregido = con(conCierre, o => { o.cajas[0].dif = 50; });
assert(autorizar(conCierre, cierreCorregido, T(usr('empleado'))), 'el empleado no corrige un cierre');
assert(autorizar(conCierre, cierreCorregido, T(usr('gerente'))), 'un cierre confirmado no cambia desde un guardado común (ni el gerente); la corrección con caja.editar la define la rama de caja');
assert.strictEqual(autorizar(base, con(base, o => { o.cajas.push({ id: 2, uid: 2, ini: 0, movs: [] }); }), T(usr('empleado'))), null, 'el empleado opera la caja del día');

// ---- 3. Ocultar y restaurar costos ----
const completo = {
  prods: [{ id: 1, name: 'Yerba', price: 100, cost: 60, lots: [] }, { id: 2, name: 'Queso', price: 50, cost: 25.555, unidad: 'kg', lots: [] }],
  sales: [{ id: 1, items: [{ id: 1, qty: 2, price: 100, cost: 60 }] }], desv: [{ id: 1, items: [{ id: 1, qty: 1, cost: 60 }] }],
  orders: [{ id: 1, supplier: 'P', items: [{ pid: 1, qty: 3, cost: 60 }], receipts: [] }], recepciones: [{ id: 1, items: [{ id: 1, q: 1, c: 60 }] }],
  ajustes: [{ id: 1, tipo: 'producto.precio', txt: 'Yerba: precio $ 90 → $ 100 · costo $ 50 → $ 60' }, { id: 2, tipo: 'producto.precio', txt: 'Yerba: costo $ 50 → $ 60 (recepción)' }, { id: 3, tipo: 'stock.ingreso', txt: 'Yerba: +5' }]
};
const oculto = costos.ocultar(completo), texto = JSON.stringify(oculto);
assert(!/"cost":[1-9]|"c":[1-9]/.test(texto), 'no queda ningún costo en lo que recibe la interfaz');
assert(!/costo \$ ?\d|· costo/.test(texto) && oculto.ajustes[0].txt === 'Yerba: precio $ 90 → $ 100' && oculto.ajustes[2].txt === 'Yerba: +5', 'los textos del historial no muestran costos');
assert.strictEqual(completo.prods[0].cost, 60, 'ocultar no toca el original');
// La interfaz guarda con una venta nueva y un cambio de precio; el costo real vuelve y la venta nueva lleva el vigente.
const vuelve = con(oculto, o => { o.prods[0].price = 110; o.prods[0].cost = 999; o.sales.push({ id: 2, items: [{ id: 1, qty: 1, price: 110, cost: 0 }, { id: 2, qty: 500, price: 50, cost: 0 }] }); o.prods.push({ id: 3, name: 'N', price: 1, cost: 7, lots: [] }); });
const r = costos.restaurar(completo, vuelve);
assert.strictEqual(r.prods[0].price, 110); assert.strictEqual(r.prods[0].cost, 60, 'el costo real no se pisa (ni aunque la interfaz mande otro)');
assert.strictEqual(r.prods[2].cost, 0, 'un producto nuevo no entra con costo si no se ven costos');
assert.strictEqual(r.sales[1].items[0].cost, 60, 'la venta nueva guarda el costo vigente'); assert.strictEqual(r.sales[1].items[1].cost, 25.56, 'por peso, redondeado a centavos');
assert.strictEqual(r.sales[0].items[0].cost, 60); assert.strictEqual(r.desv[0].items[0].cost, 60); assert.strictEqual(r.orders[0].items[0].cost, 60); assert.strictEqual(r.recepciones[0].items[0].c, 60);
assert.deepStrictEqual(r.ajustes[0], completo.ajustes[0], 'los ajustes sin cambios vuelven como estaban');
assert.strictEqual(costos.restaurar(null, vuelve), vuelve);

// ---- 4. Proceso principal (main.js con Electron simulado) ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-costos-')), ud = path.join(tmp, 'userData');
fs.mkdirSync(ud, { recursive: true });
fs.writeFileSync(path.join(ud, 'config.json'), JSON.stringify({ backupDir: path.join(tmp, 'respaldos') }));   // carpeta temporal: nunca la real
function arrancar() {
  const h = {}, on = {};
  class BrowserWindow { constructor() { this.webContents = { on() {}, once() {}, send() {}, setWindowOpenHandler() {}, session: { setPermissionRequestHandler() {} } }; } maximize() {} on() {} once() {} reload() {} destroy() {} isDestroyed() { return false; } loadFile() {} }
  const app = { requestSingleInstanceLock: () => true, quit() {}, whenReady: () => Promise.resolve(), on() {}, getVersion: () => '0.0.0', isPackaged: false, getAppMetrics: () => [], getPath: k => (k === 'userData' ? ud : path.join(tmp, k)) };
  const electron = { app, BrowserWindow, Menu: { setApplicationMenu() {} }, dialog: { showSaveDialog: async () => ({ canceled: true }) }, ipcMain: { handle: (n, f) => { h[n] = f; }, on: (n, f) => { on[n] = f; } }, shell: { openExternal() {}, openPath() {} },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('x' + s), decryptString: b => b.toString().slice(1) } };
  const orig = Module._load;
  Module._load = function (req, ...a) { if (req === 'electron') return electron; if (req === 'electron-updater') throw new Error('sin actualizador en pruebas'); return orig.call(this, req, ...a); };
  for (const k of Object.keys(require.cache)) if (!k.includes('node_modules')) delete require.cache[k];
  require('../main.js'); Module._load = orig;
  const sync = (n, ...a) => { const e = {}; on[n](e, ...a); return e.returnValue; };
  return new Promise(res => setImmediate(() => res({ h, sync })));
}
const datos = () => ({ prods: [{ id: 1, name: 'Yerba', price: 100, cost: 60, lots: [{ n: '', qty: 10, exp: '' }] }], sales: [{ id: 1, date: '2026-11-16T10:00:00.000Z', items: [{ id: 1, qty: 1, price: 100, cost: 60 }], total: 100, pay: 'Efectivo', caja: 1 }],
  cajas: [{ id: 1, uid: 2, ini: 0, movs: [] }], fin: { mov: [], pagar: [], emp: [], banco: [], id: 1 }, cfg: {}, pays: [], cargos: [], clients: [], ajustes: [{ id: 1, tipo: 'producto.precio', txt: 'Yerba: precio $ 90 → $ 100 · costo $ 50 → $ 60' }], rev: 0 });
const enDisco = () => JSON.parse(fs.readFileSync(path.join(ud, 'stockproject-data.json'), 'utf8'));

(async () => {
  fs.writeFileSync(path.join(ud, 'stockproject-data.json'), JSON.stringify(datos()));
  const m = await arrancar(), call = (n, ...a) => m.h['auth:call']({}, n, a);
  assert((await call('crear', { user: 'ana', rol: 'admin', clave: 'Clave1234' })).ok);   // crea el primer admin y queda con sesión
  assert((await call('crear', { user: 'luis', rol: 'empleado', clave: 'Clave1234' })).ok);
  assert((await call('crear', { user: 'jefa', rol: 'gerente', clave: 'Clave1234' })).ok);
  const sg = await call('crear', { user: 'gero', rol: 'gerente', clave: 'Clave1234', deny: ['costos.ver', 'costos.editar', 'margenes.ver', 'margenes.editar', 'rentabilidad.ver'] }); assert(sg.ok, sg.err);
  assert((await call('crear', { user: 'sup', rol: 'gerente', clave: 'Clave1234', deny: ['costos.editar', 'anulacion.crear'] })).ok);
  const prueba = async f => { const x = JSON.parse(m.sync('load')); f(x); return m.h.save({}, JSON.stringify(x), m.sync('version')); };
  const como = async u => { await m.h['auth:logout'](); assert((await m.h['auth:login']({}, u, 'Clave1234')).ok); };

  // Empleado: recibe los datos sin costos; vender no rompe la ganancia; no cambia costos aunque lo intente.
  await como('luis');
  const vista = JSON.parse(m.sync('load'));
  assert.strictEqual(vista.prods[0].cost, 0, 'el empleado recibe el costo en 0'); assert.strictEqual(vista.sales[0].items[0].cost, 0);
  assert(!m.sync('load').includes('costo $'), 'ni en el historial de ajustes');
  let res = await prueba(x => { x.sales.push({ id: 2, date: new Date().toISOString(), items: [{ id: 1, qty: 1, price: 100, cost: 0 }], total: 100, pay: 'Efectivo', caja: 1 }); x.prods[0].lots[0].qty = 9; });
  assert(res.ok, 'el empleado vende: ' + res.err);
  assert.strictEqual(enDisco().sales[1].items[0].cost, 60, 'la venta del empleado guarda el costo real para la ganancia');
  assert.strictEqual(enDisco().prods[0].cost, 60); assert(enDisco().ajustes[0].txt.includes('costo $ 50'), 'el historial real conserva su texto');
  res = await prueba(x => { x.prods[0].cost = 1; x.prods[0].price = 130; });
  assert(res.ok && enDisco().prods[0].cost === 60 && enDisco().prods[0].price === 130, 'el costo no cambia pero el precio sí');
  res = await prueba(x => { x.sales.find(s => s.id === 1).void = true; }); assert(!res.ok && res.permiso, 'el empleado no anula');
  assert.strictEqual(await m.h['emp:consolidado']({}, { desde: '2026-01-01', hasta: '2026-12-31', base: 'ARS', estado: {} }), null, 'ni el consolidado con ganancia');

  // Gerente sin costos: cambia el precio, no ve ni cambia costos.
  await como('gero');
  assert.strictEqual(JSON.parse(m.sync('load')).prods[0].cost, 0);
  res = await prueba(x => { x.prods[0].price = 140; }); assert(res.ok, res.err); assert.strictEqual(enDisco().prods[0].price, 140);
  res = await prueba(x => { x.prods[0].cost = 5; x.prods[0].price = 150; }); assert(res.ok && enDisco().prods[0].cost === 60, 'el costo real sigue');
  // Tiene permiso de respaldos pero no de ver costos: no puede sacar una copia, que lleva los costos.
  for (const e of ['b:export', 'seg:copiaProtegida']) { const x = await m.h[e]({}, 'Clave12345'); assert(!x.ok && /costos/.test(x.err || ''), e + ' no se exporta sin ver costos'); }

  // Gerente que ve costos pero no los edita (ni anula): el proceso principal rechaza.
  await como('sup');
  assert.strictEqual(JSON.parse(m.sync('load')).prods[0].cost, 60, 'quien ve costos los recibe');
  res = await prueba(x => { x.prods[0].cost = 5; }); assert(!res.ok && res.permiso && /costos/.test(res.err), 'main.js rechaza el cambio de costo sin permiso');
  res = await prueba(x => { x.sales.find(s => s.id === 1).void = true; }); assert(!res.ok && res.permiso, 'main.js rechaza anular sin permiso');
  res = await prueba(x => { x.prods[0].price = 160; }); assert(res.ok, res.err);

  // Gerente completo: costos, anulación y exportación siguen funcionando.
  await como('jefa');
  assert.strictEqual(JSON.parse(m.sync('load')).prods[0].cost, 60);
  res = await prueba(x => { x.prods[0].cost = 65; }); assert(res.ok && enDisco().prods[0].cost === 65, res.err);
  res = await prueba(x => { x.sales.find(s => s.id === 1).void = true; }); assert(res.ok, 'el gerente completo anula: ' + res.err);
  assert(!(await m.h['b:export']({})).err, 'el gerente completo exporta (el diálogo se cancela en la prueba)');

  // Auditoría: quién cambió qué permisos a quién.
  await como('ana');
  assert((await call('editar', 2, { extra: ['ventas.eliminar'], deny: ['clientes.crear'] })).ok);
  const aud = await call('auditoria', {}); const reg = aud.find(x => x.accion === 'permisos.cambiar' && /^luis /.test(x.detalle));
  assert(reg && reg.user === 'ana' && reg.t && /\+extra:ventas\.eliminar/.test(reg.detalle) && /\+deny:clientes\.crear/.test(reg.detalle), 'queda quién, a quién, qué y cuándo: ' + JSON.stringify(reg));
  assert(aud.some(x => x.accion === 'permisos.cambiar' && /^gero .*\+deny:.*costos\.ver/.test(x.detalle)), 'el alta con permisos negados también queda');
  assert((await call('editar', 2, { extra: ['costos.ver'] })).ok);
  await m.h['auth:logout']();
  // Con costos.ver otorgado por extra, el empleado sí los recibe.
  assert((await m.h['auth:login']({}, 'luis', 'Clave1234')).ok);
  assert.strictEqual(JSON.parse(m.sync('load')).prods[0].cost, 65, 'costos.ver dado por extra se respeta');

  // ---- 5. Pantallas: lo que ve cada usuario (jsdom) ----
  const estado = (rol, extra = [], deny = []) => { const u = usr(rol, extra, deny); return { habilitado: true, usuario: { id: 2, user: rol, nombre: rol, rol, prefs: {} }, permisos: U.matriz(u), roles: U.ROLES, modulos: U.MODULOS, acciones: U.ACCIONES, finos: U.FINOS, permisosRol: Object.fromEntries(Object.keys(U.PERMISOS).map(k => [k, U.matriz(usr(k))])) }; };
  const pantalla = auth => { const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.SP_BOOT = { rev: 0, data: null, defaults: {}, auth };
    w.fetch = async u => { const j = /misSesiones|listar|auditoria/.test(u) ? [] : /rev/.test(u) ? { rev: 0 } : { ok: true }; return { status: 200, ok: true, json: async () => j, text: async () => JSON.stringify(j) }; }; } }); return api(dom.window); };
  const vender = a => a.w.eval("if(!db.prods.length)db.prods.push({id:db.nid++,name:'Coca',code:'1',price:2800,cost:1900,min:0,lots:[{id:db.lid++,n:'',qty:5,exp:''}]});db.sales.push({id:(db.sid=(db.sid||1)+50),date:new Date().toISOString(),items:[{id:db.prods[0].id,name:db.prods[0].name,qty:2,price:2800,cost:1900,lots:[]}],total:5600,pay:'Efectivo',user:'x'});draw()");
  const textoDe = a => ['p', 'i', 'r', 'f', 'a', 'o'].map(t => { a.tab(t); return a.$('#' + t).textContent; }).join(' ');
  const sin = pantalla(estado('empleado', ['reporte.ver', 'finanzas.ver'])); vender(sin);
  const t1 = textoDe(sin).replace(/[\s ]+/g, ' ');
  assert(sin.d.documentElement.classList.contains('sin-costo') && sin.d.documentElement.classList.contains('sin-rent'));
  assert(!/Ganancia estimada|Rentabilidad:|Ganancia bruta|Costo de lo vendido|Mercadería \(a costo\)/.test(t1) && !/Resultado del período/.test(sin.$('#f_k').textContent), 'el empleado no ve ganancia, costo ni resultado en reportes, finanzas ni analítica');
  assert(/no tiene permiso/.test(sin.$('#f_res').textContent) && /no tiene permiso/.test(sin.$('#f_bal').textContent), 'el resumen y el balance avisan que no hay permiso');
  assert(!/antes \$|Costo estimado/.test(t1));
  assert(!/1\.900|1900/.test([...sin.d.querySelectorAll('#inv td.x-costo, #me_l td.x-costo')].map(x => x.textContent).join('')), 'el costo no está en las tablas');
  assert(!/Valor de vida/.test(t1) && !/Ganancia/.test(sin.$('#an_out').textContent), 'ni en analítica');
  const todo = pantalla(estado('gerente')); vender(todo); const t2 = textoDe(todo).replace(/[\s ]+/g, ' ');
  assert(!todo.d.documentElement.classList.contains('sin-costo') && /Ganancia estimada/.test(t2) && /Costo de lo vendido/.test(t2), 'el gerente completo sí los ve');
  assert(/1\.900/.test(todo.$('#inv').textContent), 'el gerente ve el costo en la tabla');
  const g2 = pantalla(estado('gerente', [], ['costos.ver', 'margenes.ver', 'rentabilidad.ver'])); vender(g2);
  assert(g2.d.documentElement.classList.contains('sin-costo') && g2.d.documentElement.classList.contains('sin-margen'), 'el gerente sin costo no ve columnas de costo ni margen');
  assert(/precio|Precio/.test(g2.$('#inv').closest('section').textContent), 'pero sí ve precios');
  const adm = pantalla(estado('admin')); adm.tab('u');
  assert(await until(() => adm.$('#n_m').querySelectorAll('input[data-m=costos]').length === 2 && adm.$('#n_m').querySelectorAll('input[data-m=precios]').length === 1), 'los permisos finos se asignan por usuario en Usuarios');
  assert(adm.$('#n_m').querySelectorAll('input').length > U.MODULOS.length * 4);
  assert.strictEqual(sin.errs.length + todo.errs.length + g2.errs.length + adm.errs.length, 0, [...sin.errs, ...todo.errs, ...g2.errs, ...adm.errs].join('\n'));
  console.log('permisos-costos: ok'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
