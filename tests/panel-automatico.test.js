// Al terminar la encuesta con el nombre del negocio, el programa crea su panel en el servidor, empieza a enviar datos
// y muestra la dirección y la clave. Sin Internet queda pendiente y se crea solo. El alta pública está limitada.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM, HTML, api, until } = require('./helpers');
const crearNube = require('../nube'), { crear } = require('../nube/servidor');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-panel-')), ADMIN = 'z'.repeat(40);
  const S = crear({ dataDir: dir, adminToken: ADMIN }), puerto = await S.listen(0, '127.0.0.1'), base = 'http://127.0.0.1:' + puerto;
  // El servidor ve todos los pedidos desde 127.0.0.1: cada bloque usa un "programa" distinto pero la misma IP.
  let cfg = {}, caido = false;
  const enviar = (u, o) => caido ? Promise.reject(new TypeError('fetch failed')) : fetch(u, o);
  const N = crearNube({ leer: () => '{"prods":[],"sales":[],"shop":{"n":"x"}}', getCfg: () => cfg, setCfg: p => { cfg = { ...cfg, ...p }; }, servidor: base, enviar, programar: () => 1, cancelar: () => {}, proteger: t => 'P:' + Buffer.from(t).toString('base64'), desproteger: t => Buffer.from(t.slice(2), 'base64').toString() });
  // ---- el programa de escritorio (simulado) con la encuesta ----
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.sp = { load: () => '', save: async () => ({ ok: true, rev: 1 }), version: () => 0, defaults: () => ({}), info: async () => ({ dir: 'x', last: null, warn: '' }), now: async () => ({}), choose: async () => ({}), restore: async () => true,
      nube: { estado: async () => N.estado(), call: async (n, a) => n === 'registrar' ? N.registrar(a) : n === 'clave' ? { ok: true, clave: N.clave() } : n === 'ahora' ? N.sincronizar(true) : { ok: false } } };
  } });
  const A = api(dom.window), { $, w } = A, ev = w.eval.bind(w);
  const radio = (n, v) => { const i = $(`#enc [name="${n}"][value="${v}"]`); i.checked = true; i.dispatchEvent(new w.Event('change', { bubbles: true })); };
  ev('CF.abrirEncuesta(true)'); radio('tipo', 'kiosco'); A.click('#e_sig'); A.click('#e_sig'); A.click('#e_sig'); A.click('#e_sig');
  assert($('#e_panel') && $('#e_panel').checked, 'crear el panel viene marcado'); $('#e_nom').value = 'Kiosco Ñandú'; A.click('#e_sig');
  assert.strictEqual(A.db().shop.n, 'Kiosco Ñandú', 'el nombre queda como nombre del comercio (ticket)');
  assert(await until(() => $('#nbok'), 6000), 'aparece "Tu panel está listo"');
  const vals = [...w.document.querySelectorAll('#nbok input')].map(i => i.value); assert.strictEqual(vals[0], base + '/c/kiosco-nandu', 'dirección a partir del nombre, sin tildes ni eñes');
  assert(/^[a-z2-9]{10}$/.test(vals[1]), 'muestra la clave del panel');
  // quedó conectado y enviando
  const e = N.estado(); assert(e.configurado && e.activo && e.tieneClave && !e.pendiente); assert(!JSON.stringify(cfg).includes(vals[1]), 'la clave del panel se guarda protegida');
  const login = await fetch(base + '/c/kiosco-nandu/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: vals[1] }) }); assert.strictEqual(login.status, 200, 'la clave sirve en el panel');
  const ck = login.headers.get('set-cookie').split(';')[0];
  assert(await until(async () => { const d = await (await fetch(base + '/c/kiosco-nandu/api/datos', { headers: { Cookie: ck } })).json(); return d.foto && d.foto.negocio; }, 6000), 'el panel ya tiene datos');
  assert.strictEqual(N.clave(), vals[1], 'la clave se puede volver a ver'); assert(!(await N.registrar('Otro')).ok, 'no se crea un segundo panel');
  w.document.querySelector('#nbok_x').click(); assert(!$('#nbok'));

  // ---- sin Internet: queda pendiente y se crea solo al volver ----
  let cfg2 = {}; const N2 = crearNube({ leer: () => '{"prods":[],"sales":[]}', getCfg: () => cfg2, setCfg: p => { cfg2 = { ...cfg2, ...p }; }, servidor: base, enviar, programar: () => 1, cancelar: () => {}, proteger: t => 'P:' + Buffer.from(t).toString('base64'), desproteger: t => Buffer.from(t.slice(2), 'base64').toString() });
  caido = true; let r = await N2.registrar('Kiosco Ñandú'); assert(!r.ok && r.pendiente); assert.strictEqual(N2.estado().pendiente, 'Kiosco Ñandú');
  caido = false; await N2.sincronizar(); const e2 = N2.estado(); assert(e2.configurado && !e2.pendiente, 'se creó al volver Internet');
  assert(/\/c\/kiosco-nandu-2$/.test(e2.panel), 'si la dirección está ocupada, agrega un número');

  // ---- límites del alta pública ----
  const reg = nombre => fetch(base + '/registro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre }) });
  assert.strictEqual((await reg('x')).status, 400, 'nombre muy corto'); assert.strictEqual((await reg('Tercero')).status, 201);
  assert.strictEqual((await reg('Cuarto')).status, 429, 'más de 3 por hora desde la misma conexión: no');
  assert.strictEqual((await fetch(base + '/registro')).status, 405);
  const lista = await (await fetch(base + '/admin/comercios', { headers: { Authorization: 'Bearer ' + ADMIN } })).json(); assert.strictEqual(lista.length, 3);
  await S.close(); fs.rmSync(dir, { recursive: true, force: true });
  assert.deepStrictEqual(A.errs, []); console.log('PANEL_AUTOMATICO_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
