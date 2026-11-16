// Clave del panel elegida por el cliente: registro con clave propia, login que distingue mayúsculas (solo para
// claves propias), cambio desde el panel (/api/clave) y desde el programa (/clave-instalacion), y la encuesta.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { crear } = require('../nube/servidor.js');
const crearNube = require('../nube');
const { JSDOM, HTML, api, until } = require('./helpers');
console.log = (log => (...a) => { if (!/^\[(admin|registro|clave)\]/.test(String(a[0]))) log(...a); })(console.log);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-clave-')), ADMIN = 'k'.repeat(40);
  let reloj = Date.parse('2026-03-10T15:00:00.000Z');
  const S = crear({ dataDir: dir, adminToken: ADMIN, ahora: () => reloj, confiarProxy: true });
  const base = 'http://127.0.0.1:' + await S.listen(0, '127.0.0.1');
  // Cada bloque usa una IP distinta (X-Forwarded-For con confiarProxy) para no chocar con el límite de altas.
  let ipN = 1; const nuevaIp = () => '10.0.0.' + (ipN++);
  async function pedir(metodo, ruta, o = {}) {
    const headers = { 'X-Forwarded-For': o.ip || '10.9.9.9' };
    if (o.token) headers.Authorization = 'Bearer ' + o.token;
    if (o.cookie) headers.Cookie = o.cookie;
    let body; if (o.body !== undefined) { body = JSON.stringify(o.body); headers['Content-Type'] = 'application/json'; }
    const r = await fetch(base + ruta, { method: metodo, headers, body });
    let j = null; try { j = await r.json(); } catch {}
    return { estado: r.status, j, h: r.headers };
  }
  const cookieDe = r => (r.h.get('set-cookie') || '').split(';')[0];
  const crudo = () => fs.readdirSync(dir).map(f => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } }).join('\n');

  // ---- registro con clave propia: validaciones ----
  const ip1 = nuevaIp();
  for (const [clave, por] of [['corta1', 'corta'], ['sinnumeroslarga', 'sin número'], ['12345678', 'sin letra'], ['Kiosco 2000', 'igual al nombre'], ['a1'.repeat(33), 'muy larga'], [123, 'no es texto']]) {
    const r = await pedir('POST', '/registro', { ip: ip1, body: { nombre: 'Kiosco 2000', clave } });
    assert.strictEqual(r.estado, 400, 'clave inválida (' + por + ')'); assert(r.j && /clave/i.test(r.j.error), 'mensaje claro: ' + por);
  }
  const PROPIA = 'MiClave2026';
  const reg = await pedir('POST', '/registro', { ip: ip1, body: { nombre: 'Kiosco 2000', clave: PROPIA } });
  assert.strictEqual(reg.estado, 201); assert(!('clave' in reg.j), 'no devuelve la clave elegida');
  const sub = reg.j.sub, TOKEN = reg.j.token;
  const login = (clave, ip = '10.8.0.1', s = sub) => pedir('POST', '/c/' + s + '/api/login', { ip, body: { clave } });
  assert.strictEqual((await login('miclave2026')).estado, 401, 'clave propia distingue mayúsculas');
  assert.strictEqual((await login('MICLAVE2026')).estado, 401);
  const l1 = await login('  ' + PROPIA + ' '); assert.strictEqual(l1.estado, 200, 'solo se quitan espacios de los extremos');
  // comercio con clave generada: sigue entrando en minúsculas o mayúsculas
  const gen = await pedir('POST', '/registro', { ip: ip1, body: { nombre: 'Almacén Generado' } });
  assert.strictEqual(gen.estado, 201); assert.match(gen.j.clave, /^[a-z2-9]{10}$/);
  assert.strictEqual((await login(gen.j.clave.toUpperCase(), '10.8.0.2', gen.j.sub)).estado, 200, 'generada: no distingue mayúsculas');
  // comercio viejo (sin claveTipo): igual que generada
  const leerC = id => JSON.parse(fs.readFileSync(path.join(dir, 'comercio', id + '.json'), 'utf8')), lista = fs.readdirSync(path.join(dir, 'comercio')).map(f => leerC(f.slice(0, -5)));
  assert.strictEqual(lista.find(c => c.sub === sub).claveTipo, 'propia'); assert.strictEqual(lista.find(c => c.sub === gen.j.sub).claveTipo, 'generada');
  await S.close();
  const viejo = lista.find(c => c.sub === gen.j.sub); delete viejo.claveTipo; fs.writeFileSync(path.join(dir, 'comercio', viejo.id + '.json'), JSON.stringify(viejo));
  const S2 = crear({ dataDir: dir, adminToken: ADMIN, ahora: () => reloj, confiarProxy: true });
  const puerto2 = await S2.listen(0, '127.0.0.1'); const base2 = 'http://127.0.0.1:' + puerto2;
  const pedir2 = (m, r, o) => { return (async () => { const headers = { 'X-Forwarded-For': (o && o.ip) || '10.9.9.9' }; if (o && o.token) headers.Authorization = 'Bearer ' + o.token; if (o && o.cookie) headers.Cookie = o.cookie; let body; if (o && o.body !== undefined) { body = JSON.stringify(o.body); headers['Content-Type'] = 'application/json'; } const x = await fetch(base2 + r, { method: m, headers, body }); let j = null; try { j = await x.json(); } catch {} return { estado: x.status, j, h: x.headers }; })(); };
  assert.strictEqual((await pedir2('POST', '/c/' + gen.j.sub + '/api/login', { ip: '10.8.0.3', body: { clave: ' ' + gen.j.clave.toUpperCase() } })).estado, 200, 'comercio viejo sin claveTipo entra en minúsculas');

  // ---- /api/clave desde el panel ----
  const P = (ruta, o) => pedir2('POST', '/c/' + sub + ruta, o);
  const sesA = cookieDe(await P('/api/login', { ip: '10.7.0.1', body: { clave: PROPIA } }));
  const sesB = cookieDe(await P('/api/login', { ip: '10.7.0.2', body: { clave: PROPIA } }));
  assert(sesA && sesB && sesA !== sesB);
  assert.strictEqual((await P('/api/clave', { ip: '10.7.0.1', body: { actual: PROPIA, nueva: 'OtraClave99' } })).estado, 401, 'sin sesión no');
  // sesión de otro comercio
  const sesOtro = cookieDe(await pedir2('POST', '/c/' + gen.j.sub + '/api/login', { ip: '10.7.0.9', body: { clave: gen.j.clave } }));
  assert.strictEqual((await P('/api/clave', { ip: '10.7.0.9', cookie: sesOtro, body: { actual: PROPIA, nueva: 'OtraClave99' } })).estado, 401, 'una sesión de otro comercio no sirve');
  // actual mala: 401 y cuenta intentos (5 cada 10 min por IP+comercio, compartido con el login)
  for (let i = 0; i < 5; i++) assert.strictEqual((await P('/api/clave', { ip: '10.7.0.1', cookie: sesA, body: { actual: 'mala1234x', nueva: 'OtraClave99' } })).estado, 401);
  assert.strictEqual((await P('/api/clave', { ip: '10.7.0.1', cookie: sesA, body: { actual: PROPIA, nueva: 'OtraClave99' } })).estado, 429, 'tope de intentos');
  assert.strictEqual((await P('/api/login', { ip: '10.7.0.1', body: { clave: PROPIA } })).estado, 429, 'el tope es el mismo que el del login');
  reloj += 11 * 60 * 1000;
  assert.strictEqual((await P('/api/clave', { ip: '10.7.0.1', cookie: sesA, body: { actual: PROPIA, nueva: 'corta1' } })).estado, 400, 'nueva inválida');
  assert.strictEqual((await P('/api/clave', { ip: '10.7.0.1', cookie: sesA, body: { actual: PROPIA, nueva: 'Kiosco 2000' } })).estado, 400, 'igual al nombre');
  const ok = await P('/api/clave', { ip: '10.7.0.1', cookie: sesA, body: { actual: PROPIA, nueva: 'OtraClave99' } });
  assert.strictEqual(ok.estado, 200); assert.deepStrictEqual(ok.j, { ok: true });
  assert.strictEqual((await pedir2('GET', '/c/' + sub + '/api/datos', { cookie: sesA })).estado, 200, 'la sesión actual sigue');
  assert.strictEqual((await pedir2('GET', '/c/' + sub + '/api/datos', { cookie: sesB })).estado, 401, 'las otras sesiones se cierran');
  assert.strictEqual((await P('/api/login', { ip: '10.7.0.3', body: { clave: PROPIA } })).estado, 401, 'la vieja ya no sirve');
  assert.strictEqual((await P('/api/login', { ip: '10.7.0.3', body: { clave: 'OtraClave99' } })).estado, 200);
  assert.strictEqual((await pedir2('GET', '/c/' + sub + '/api/clave', { cookie: sesA })).estado, 405, 'solo POST');
  assert.strictEqual((await P('/api/clave2', { cookie: sesA, body: {} })).estado, 404);

  // ---- /clave-instalacion desde el programa ----
  assert.strictEqual((await pedir2('POST', '/clave-instalacion', { ip: '10.6.0.1', token: 'spn_' + '0'.repeat(48), body: { nueva: 'DesdePC123' } })).estado, 401, 'token inválido');
  assert.strictEqual((await pedir2('POST', '/clave-instalacion', { ip: '10.6.0.1', body: { nueva: 'DesdePC123' } })).estado, 401, 'sin token');
  assert.strictEqual((await pedir2('POST', '/clave-instalacion', { ip: '10.6.0.1', token: TOKEN, body: { nueva: 'sinnumero' } })).estado, 400);
  assert.strictEqual((await pedir2('GET', '/clave-instalacion', { ip: '10.6.0.1', token: TOKEN })).estado, 405);
  assert.strictEqual((await pedir2('POST', '/clave-instalacion', { ip: '10.6.0.1', token: TOKEN, body: { nueva: 'DesdePC123' } })).estado, 200);
  assert.strictEqual((await pedir2('GET', '/c/' + sub + '/api/datos', { cookie: sesA })).estado, 401, 'cierra todas las sesiones');
  assert.strictEqual((await P('/api/login', { ip: '10.7.0.4', body: { clave: 'desdepc123' } })).estado, 401);
  assert.strictEqual((await P('/api/login', { ip: '10.7.0.4', body: { clave: 'DesdePC123' } })).estado, 200);
  // tope de intentos como /ingesta (20 por minuto por IP)
  for (let i = 0; i < 20; i++) await pedir2('POST', '/clave-instalacion', { ip: '10.6.0.2', token: 'malo', body: { nueva: 'DesdePC123' } });
  assert.strictEqual((await pedir2('POST', '/clave-instalacion', { ip: '10.6.0.2', token: TOKEN, body: { nueva: 'DesdePC123' } })).estado, 429);

  // ---- nada de las claves en claro en el almacén ----
  const t = crudo();
  for (const k of [PROPIA, 'OtraClave99', 'DesdePC123', gen.j.clave]) assert(!t.includes(k), 'la clave no queda en claro en disco: ' + k);
  await S2.close();

  // ---- programa de escritorio: encuesta con clave elegida → llega al servidor; cambiarClave ----
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-clave3-'));
  const S3 = crear({ dataDir: dir3, adminToken: ADMIN }), base3 = 'http://127.0.0.1:' + await S3.listen(0, '127.0.0.1');
  let cfg = {}; const enviados = [];
  const enviar = (u, o) => { enviados.push({ u, body: o && o.body }); return fetch(u, o); };
  const N = crearNube({ leer: () => '{"prods":[],"sales":[],"shop":{"n":"x"}}', getCfg: () => cfg, setCfg: p => { cfg = { ...cfg, ...p }; }, servidor: base3, enviar, programar: () => 1, cancelar: () => {}, proteger: x => 'P:' + Buffer.from(x).toString('base64'), desproteger: x => Buffer.from(x.slice(2), 'base64').toString() });
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.sp = { load: () => '', save: async () => ({ ok: true, rev: 1 }), version: () => 0, defaults: () => ({}), info: async () => ({ dir: 'x', last: null, warn: '' }), now: async () => ({}), choose: async () => ({}), restore: async () => true,
      nube: { estado: async () => N.estado(), call: async (n, a) => n === 'registrar' ? (a && typeof a === 'object' ? N.registrar(a.nombre, a.clave) : N.registrar(a)) : n === 'cambiarClave' ? N.cambiarClave(a) : n === 'clave' ? { ok: true, clave: N.clave() } : { ok: false } } };
  } });
  const A = api(dom.window), { $, w } = A, ev = w.eval.bind(w);
  const radio = (n, v) => { const i = $(`#enc [name="${n}"][value="${v}"]`); i.checked = true; i.dispatchEvent(new w.Event('change', { bubbles: true })); };
  ev('CF.abrirEncuesta(true)'); radio('tipo', 'kiosco'); A.click('#e_sig'); A.click('#e_sig'); A.click('#e_sig'); A.click('#e_sig');
  assert($('#e_cl') && $('#e_cl2'), 'aparecen los campos de clave'); assert.strictEqual($('#e_cl').type, 'password');
  assert.notStrictEqual($('#e_clw').style.display, 'none', 'visibles con la casilla marcada');
  $('#e_panel').checked = false; $('#e_panel').dispatchEvent(new w.Event('change')); assert.strictEqual($('#e_clw').style.display, 'none', 'se ocultan sin la casilla');
  $('#e_panel').checked = true; $('#e_panel').dispatchEvent(new w.Event('change'));
  $('#e_nom').value = 'Kiosco Clave'; $('#e_cl').value = 'Panel2026x'; $('#e_cl2').value = 'Panel2026y'; A.click('#e_sig');
  assert($('#e_cl'), 'si no coinciden, no termina'); assert.strictEqual(enviados.length, 0);
  $('#e_cl').value = 'corta'; $('#e_cl2').value = 'corta'; A.click('#e_sig'); assert($('#e_cl'), 'clave corta: no termina');
  $('#e_cl').value = 'Panel2026x'; $('#e_cl2').value = 'Panel2026x'; A.click('#e_sig');
  assert(await until(() => $('#nbok'), 6000), 'aparece "Tu panel está listo"');
  const reg3 = enviados.find(x => /\/registro$/.test(x.u)); assert.deepStrictEqual(JSON.parse(reg3.body), { nombre: 'Kiosco Clave', clave: 'Panel2026x' }, 'la clave elegida llega al servidor');
  assert(!JSON.stringify(A.db()).includes('Panel2026x'), 'la clave no queda en los datos del negocio');
  assert(!JSON.stringify(cfg).includes('Panel2026x'), 'en la configuración queda cifrada'); assert.strictEqual(N.clave(), 'Panel2026x', '"Ver la clave" muestra la elegida');
  const sub3 = N.estado().panel.split('/c/')[1];
  const lg = c => fetch(base3 + '/c/' + sub3 + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: c }) });
  assert.strictEqual((await lg('Panel2026x')).status, 200); assert.strictEqual((await lg('panel2026x')).status, 401);
  w.document.querySelector('#nbok_x').click();
  // cambiar la clave desde Configuración
  assert.strictEqual((await N.cambiarClave('corta')).ok, false);
  $('#nb').open = true; await ev('NB.draw()'); assert(!$('#nb_acc').classList.contains('hide')); A.click('#nb_k'); assert(!$('#nb_kf').classList.contains('hide'), 'abre el formulario');
  $('#nb_k1').value = 'Nueva2027z'; $('#nb_k2').value = 'Nueva2027z'; $('#nb_kf').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert(await until(() => N.clave() === 'Nueva2027z', 6000), 'la nueva queda guardada');
  assert(!JSON.stringify(cfg).includes('Nueva2027z'), 'cifrada');
  assert.strictEqual((await lg('Nueva2027z')).status, 200); assert.strictEqual((await lg('Panel2026x')).status, 401);
  await S3.close(); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(dir3, { recursive: true, force: true });
  assert.deepStrictEqual(A.errs, []); console.log('PANEL_CLAVE_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
