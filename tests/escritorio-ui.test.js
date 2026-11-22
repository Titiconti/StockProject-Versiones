const assert = require('assert'), { JSDOM, HTML, until, api } = require('./helpers.js');
(async () => {
  const log = []; const reg = (n, r) => async (...a) => { log.push([n, ...a]); return typeof r === 'function' ? r(...a) : r; };
  let hooks = [{ id: 7, url: 'http://x.local/h', eventos: ['venta.creada'], activo: false, estado: 'HTTP 500', secreto: 'ab…' }], emps = { activa: 'principal', lista: [{ id: 'principal', nombre: 'Kiosco' }, { id: 'sucursal', nombre: 'Sucursal' }] };
  let cbUpd = null, estUpd = { fase: 'al-dia', version: '2.0.0', nueva: null, pct: 0, empaquetada: true, auto: true, ultima: Date.now() };
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.sp = { load: () => '', save: async () => ({ ok: true, rev: 1 }), version: () => 0, defaults: () => ({}), info: async () => ({ dir: 'x', last: null, warn: '' }), now: async () => ({}), choose: async () => ({}), restore: async () => true, print: async () => ({}), pdf: async () => ({}), exportBackup: async () => ({}),
      remote: async () => ({ running: true, port: 3000, https: false, urls: ['http://192.168.1.5:3000'], pin: '1234' }), setRemote: reg('setRemote', c => ({ running: true, https: !!c.https, urls: [] })),
      auth: { estado: () => ({ habilitado: false }), call: async () => [], ir: async () => true, login: async () => ({}), logout: async () => ({}) },
      seg: { estado: reg('seg.estado', { disponible: true, activo: false, falta: false }), activar: reg('seg.activar', { ok: true, clave: 'ab'.repeat(32) }), desactivar: reg('seg.desactivar', { ok: true }), copiaProtegida: reg('copiaProtegida', pw => pw.length < 8 ? { ok: false, err: 'La contraseña de la copia debe tener al menos 8 caracteres' } : { ok: true }), restaurarProtegida: reg('restaurarProtegida', { ok: false, err: 'Contraseña incorrecta o archivo dañado.' }), importarClave: reg('importarClave', { ok: true }) },
      emp: { listar: reg('emp.listar', () => emps), crear: reg('emp.crear', n => { emps.lista.push({ id: 'n', nombre: n }); return { ok: true, id: 'n' }; }), renombrar: reg('emp.renombrar', { ok: true }), cambiar: reg('emp.cambiar', { ok: true }),
        consolidado: reg('emp.consolidado', o => ({ base: o.base, filas: [{ id: 'principal', nombre: 'Kiosco', moneda: 'ARS', tickets: 4, ventas: 3000, ganancia: 1000, porCobrar: 500, inventario: 200 }, { id: 'sucursal', nombre: 'Sucursal', moneda: 'USD', tickets: 2, ventas: null, ganancia: null, porCobrar: null, inventario: null, sinTasa: true }], total: { ventas: 3000, ganancia: 1000, tickets: 6, porCobrar: 500, inventario: 200 }, incompleto: true })) },
      fx: { actualizar: reg('fx.actualizar', b => ({ ok: true, estado: { base: b, tasas: { USD: 1, ARS: 1000, EUR: 0.5 }, fecha: new Date().toISOString() } })) },
      upd: { estado: reg('upd.estado', () => estUpd), buscar: reg('upd.buscar', () => estUpd), instalar: reg('upd.instalar', () => ({ ok: true })), auto: reg('upd.auto', { ok: true }), alCambiar: f => { cbUpd = f; } },
      sys: { metricas: reg('sys.metricas', { cpu: 1.2, memMB: 210, libreMB: 4000, archivoMB: 0.4, iniciada: 600, ultimoRespaldo: new Date().toISOString(), servidor: { puerto: 3000, https: false, peticiones: 12, api: 3, errores: 0 }, rev: 9 }) } };
  } });
  const A = { ...api(dom.window), w: dom.window }, ev = A.w.eval.bind(A.w), $ = A.$, hubo = n => log.filter(l => l[0] === n);
  ev('UT.bajar=(n,t)=>{window.__f=[n,t]}'); A.tab('g');

  // ---- Seguridad ----
  A.click('#gp [data-s=r]'); assert(await until(() => /Desactivado/.test(A.txt('#sg_c'))), A.txt('#sg_c')); assert(!$('#sg_on').classList.contains('hide') && $('#sg_off').classList.contains('hide'));
  A.click('#sg_on'); assert(await until(() => $('#clv')), 'muestra la clave de recuperación'); assert.strictEqual($('#clv_k').value, 'ab'.repeat(32)); assert($('#clv_x').disabled, 'no deja continuar sin confirmar que la guardó');
  A.click('#clv_d'); assert(/StockProject-clave/.test(ev('window.__f[0]')) && ev('window.__f[1]').includes('ab'.repeat(32)));
  const ok = $('#clv_ok'); ok.checked = true; A.ev(ok, 'change'); assert(!$('#clv_x').disabled); A.click('#clv_x'); assert(!$('#clv'));
  A.set('#sg_pw', 'corta'); A.click('#sg_cp'); assert(await until(() => /al menos 8/.test(A.txt('#toast')))); A.set('#sg_pw', 'una-clave-larga'); A.click('#sg_cp'); await until(() => hubo('copiaProtegida').length === 2); assert.strictEqual(hubo('copiaProtegida')[1][1], 'una-clave-larga');


  // ---- Empresas, datos fiscales, tipos de cambio ----
  A.click('#gp [data-s=n]'); assert(await until(() => /Kiosco/.test(A.txt('#g_m')) && /En uso/.test(A.txt('#g_m'))));
  A.set('#em_n', 'Local 2'); A.click('#em_g'); assert(await until(() => hubo('emp.crear').length === 1) && await until(() => /Local 2/.test(A.txt('#g_m'))));
  A.click($('#g_m [data-ec="sucursal"]')); assert.strictEqual(hubo('emp.cambiar').length, 0, 'pide confirmar el cambio de empresa'); A.click($('#g_m [data-ec="sucursal"]')); assert(await until(() => hubo('emp.cambiar').length === 1));
  A.click($('#g_m [data-er="sucursal"]')); assert(await until(() => $('#er_n'))); A.set('#er_n', 'Sucursal Centro'); A.click($('#g_m [data-ers]')); assert(await until(() => hubo('emp.renombrar').length === 1));
  A.set('#fx_b', 'USD'); A.click('#fx_a'); assert(await until(() => ev('db.cfg.tasas&&db.cfg.tasas.tasas.ARS') === 1000), 'guarda las cotizaciones en los datos'); A.set('#cv_m', '2'); A.set('#cv_d', 'USD'); A.set('#cv_a', 'ARS'); assert(/2\.000/.test(A.txt('#cv_r')), A.txt('#cv_r'));
  A.set('#fx_d', 'USD'); A.set('#fx_h', 'ARS'); A.set('#fx_v', '1200'); A.click('#fx_m'); assert.strictEqual(ev('db.cfg.tasas.manual["USD/ARS"]'), 1200); A.set('#cv_m', '1'); A.set('#cv_d', 'USD'); A.set('#cv_a', 'ARS'); assert(/1\.200/.test(A.txt('#cv_r')), 'la tasa manual manda');
  A.click('#co_g'); assert(await until(() => /Total \(/.test(A.txt('#co_r')))); assert(/sin tasa/.test(A.txt('#co_r')) && /Falta la tasa/.test(A.txt('#co_r')), 'avisa que el total está incompleto');
  A.set('#fi_m', 'EUR'); A.set('#fi_r', 'Mi SRL'); A.set('#fi_id', '30-12345678-9'); A.set('#fi_t', '21'); A.click('#fi_g'); assert.strictEqual(ev('MON'), 'EUR'); assert(/€/.test(A.f(10))); assert.strictEqual(ev('db.cfg.fiscalCustom.tasa'), 21);

  // ---- Sistema ----
  A.click('#gp [data-s=x]'); assert(await until(() => /memoria 210 MB/.test(A.txt('#g_x'))), A.txt('#g_x').slice(0, 100)); assert(!/pedidos atendidos/.test(A.txt('#g_x')) && !/Redis/.test(A.txt('#g_x')), 'estado en una línea, sin texto técnico (ya no hay acceso por red local)');
  A.click('#sy_m'); assert(await until(() => /Guardar/.test(A.txt('#g_x')) && /Todo en orden/.test(A.txt('#g_x'))));
  // ---- Actualizaciones ----
  assert(/Versión 2\.0\.0/.test(A.txt('#g_x')) && /Tenés la última versión/.test(A.txt('#g_x')), A.txt('#g_x').slice(0, 150)); assert(!$('#up_i'), 'sin versión nueva no hay botón de actualizar');
  const au = $('#up_a'); au.checked = false; A.ev(au, 'change'); assert(await until(() => hubo('upd.auto').length === 1)); assert.strictEqual(hubo('upd.auto')[0][1], false);
  assert(!$('#updb'), 'sin aviso mientras no haya nada descargado');
  estUpd = { ...estUpd, fase: 'descargando', nueva: '2.1.0', pct: 40 }; cbUpd(estUpd); assert(await until(() => /Descargando la versión 2\.1\.0 \(40 %\)/.test(A.txt('#g_x')))); assert(!$('#updb'), 'mientras descarga no molesta');
  estUpd = { ...estUpd, fase: 'lista', pct: 100 }; cbUpd(estUpd); assert(await until(() => $('#updb')), 'aviso cuando está lista'); assert(/2\.1\.0/.test(A.txt('#updb')) && await until(() => $('#up_i')));
  ev("db.prods.push({id:1,name:'X',price:10,cost:5,min:0,lots:[{id:1,n:'A',qty:5,exp:''}]}); add(1)"); A.click('#updb_i'); assert(/venta en curso/.test(A.txt('#toast')) && hubo('upd.instalar').length === 0, 'no actualiza con una venta a medias'); ev('cart={}');
  A.click('#updb_i'); assert(await until(() => hubo('upd.instalar').length === 1), 'instala');
  A.click('#updb_x'); assert(!$('#updb'), 'Más tarde lo oculta');
  assert.deepStrictEqual(A.errs, []); console.log('escritorio-ui OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
