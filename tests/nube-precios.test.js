// Cambiar precios desde el celular: el dueño pide el cambio en el panel, el servidor lo guarda como pendiente, la PC lo aplica UNA sola
// vez (si el precio no cambió en el local) y confirma. Servidor real sobre Redis simulado + programa de escritorio en jsdom (PCEL) +
// cliente real (nube.js).
const assert = require('assert');
const { web } = require('./helpers'), crearPC = require('../nube'), { crear } = require('../nube/servidor'), { redis } = require('../nube/almacen');
(async () => {
  let reloj = Date.now(); const SIM = require('./redis-simulado')({ reloj: () => reloj }), ADMIN = 'a'.repeat(40);
  const srv = crear({ almacen: redis({ url: 'https://redis.prueba', token: 'tok', pedir: SIM.pedir, ahora: () => reloj }), adminToken: ADMIN, ahora: () => reloj, frescuraMs: 720000 });
  const base = 'http://127.0.0.1:' + await srv.listen(0, '127.0.0.1');
  const J = async (u, o = {}) => { const r = await fetch(base + u, o); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, r }; };
  const adm = b => J('/admin/comercios', { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const ana = (await adm({ nombre: 'Kiosco Ana', sub: 'ana' })).j, beto = (await adm({ nombre: 'Almacen Beto', sub: 'beto' })).j;
  const entrar = async (sub, clave) => (await fetch(base + '/c/' + sub + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave }) })).headers.get('set-cookie').split(';')[0];
  const ckA = await entrar('ana', ana.clave), ckB = await entrar('beto', beto.clave);
  const datos = async (sub, ck) => (await J('/c/' + sub + '/api/datos', { headers: { Cookie: ck } })).j;
  const pedir = (sub, ck, b) => J('/c/' + sub + '/api/precio', { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const post = (ruta, tok, cuerpo) => J(ruta, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const pend = tok => J('/ingesta/pendientes', { headers: { Authorization: 'Bearer ' + tok } });

  // ---- el programa de escritorio (jsdom, con el módulo real PCEL) y su cliente de la nube ----
  const W = web(), w = W.w, dbPC = () => JSON.parse(w.eval('JSON.stringify(db)'));
  const aplicarEnPC = lista => JSON.parse(w.eval('JSON.stringify(PCEL.aplicar(' + JSON.stringify(lista) + '))'));
  let red = 'ok', perderAck = false, cfg = {}, llamadas = [];
  const enviar = async (u, o) => { llamadas.push(u.replace(base, '')); if (red === 'caida') throw new TypeError('fetch failed'); if (perderAck && /\/ingesta\/ack$/.test(u)) throw new TypeError('respuesta perdida'); return fetch(u, o); };
  const PC = crearPC({ leer: () => w.eval('JSON.stringify(db)'), getCfg: () => cfg, setCfg: p => { cfg = { ...cfg, ...p }; }, enviar, ahora: () => reloj, programar: () => 1, cancelar: () => {}, esperar: () => 1, noEsperar: () => {}, aplicar: async lista => aplicarEnPC(lista) });
  w.eval("for (let i = 0; i < 6; i++) db.prods.push({ id: 5000 + i, name: 'Extra ' + i, code: '', price: 100 + i * 10, cost: 50, min: 0, cat: '', lots: [{ id: 5000 + i, n: 'A', qty: 50, exp: '' }] })");
  assert(PC.configurar({ url: base, token: ana.token }).ok); await PC.sincronizar();
  const X = dbPC().prods.slice(-6), P = X[0], P2 = X[1], precioPC = id => dbPC().prods.find(p => p.id === id).price;
  let d = await datos('ana', ckA); assert(d.foto.stock.some(s => s.id === P.id), 'el panel conoce el id de cada producto'); assert.deepStrictEqual(d.cambios, []);
  const v0 = d.ver;

  // 1) VALIDACIÓN y permisos en el servidor
  const nuevo = Math.round(P.price * 1.2 * 100) / 100;
  assert.strictEqual((await J('/c/ana/api/precio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid: P.id, precio: nuevo, visto: P.price }) })).s, 401, 'sin sesión no se puede');
  assert.strictEqual((await pedir('ana', ckB, { pid: P.id, precio: nuevo, visto: P.price })).s, 401, 'la sesión de otro comercio no sirve');
  const malos = [[{ pid: P.id, precio: 0, visto: P.price }, 'mayor que 0'], [{ pid: P.id, precio: -5, visto: P.price }, 'mayor que 0'], [{ pid: P.id, precio: '10', visto: P.price }, 'número'], [{ pid: P.id, precio: 1e9, visto: P.price }, 'demasiado alto'],
    [{ pid: P.id, precio: 12.345, visto: P.price }, 'decimales'], [{ pid: P.id, precio: P.price, visto: P.price }, 'mismo precio'], [{ pid: P.id, precio: P.price * 25, visto: P.price }, 'demasiado grande'],
    [{ pid: 987654, precio: nuevo, visto: P.price }, 'no está'], [{ pid: P.id, precio: nuevo }, 'precio que ves'], [{ precio: nuevo, visto: P.price }, 'producto']];
  for (const [b, txt] of malos) { const r = await pedir('ana', ckA, b); assert(r.s === 400 || r.s === 404, JSON.stringify(b) + ' → ' + r.s); assert(r.j.error.includes(txt), r.j.error + ' ~ ' + txt); }
  assert.strictEqual((await J('/c/ana/api/precio', { method: 'GET', headers: { Cookie: ckA } })).s, 405);
  let r = await pedir('ana', ckA, { pid: P.id, precio: nuevo, visto: P.price }); assert.strictEqual(r.s, 201); assert.strictEqual(r.j.cambio.estado, 'pendiente'); assert(/^p_[0-9a-f]{16}$/.test(r.j.cambio.id)); assert.strictEqual(r.j.cambio.n, P.name);
  const c1 = r.j.cambio; assert.strictEqual((await pedir('ana', ckA, { pid: P.id, precio: nuevo + 1, visto: P.price })).s, 409, 'un cambio pendiente por producto');
  d = await datos('ana', ckA); assert.deepStrictEqual(d.cambios.map(c => [c.id, c.estado, c.visto, c.precio]), [[c1.id, 'pendiente', P.price, nuevo]]); assert.notStrictEqual(d.ver, v0, 'el panel se entera (cambia la versión)');

  // 2) la PC apagada / sin internet: queda PENDIENTE, no se pierde ni se aplica solo
  red = 'caida'; await PC.consultar(); red = 'ok'; assert.strictEqual(precioPC(P.id), P.price, 'sin conexión no cambió nada'); assert.strictEqual((await datos('ana', ckA)).cambios[0].estado, 'pendiente');

  // 3) la consulta de la PC cuesta UN comando de Redis; otros comercios no ven nada ajeno
  const c0 = SIM.comandos; const q = await pend(ana.token); const gasto = SIM.comandos - c0;
  assert.deepStrictEqual(q.j.pendientes.map(x => x.id), [c1.id]); assert.strictEqual(gasto, 1, 'consulta de pendientes = 1 comando'); assert(!('estado' in q.j.pendientes[0]) && !('motivo' in q.j.pendientes[0]));
  assert.deepStrictEqual((await pend(beto.token)).j.pendientes, [], 'Beto no ve lo de Ana'); assert.strictEqual((await pend('spn_' + 'b'.repeat(48))).s, 401, 'token inválido');
  assert.strictEqual((await J('/ingesta/pendientes')).s, 401); assert.strictEqual((await J('/ingesta/pendientes', { method: 'POST', headers: { Authorization: 'Bearer ' + ana.token } })).s, 405);
  assert.strictEqual((await post('/ingesta/ack', beto.token, { resultados: [{ id: c1.id, estado: 'aplicado' }] })).j.cambiados, 0, 'Beto no puede confirmar lo de Ana'); assert.strictEqual((await datos('ana', ckA)).cambios[0].estado, 'pendiente');
  assert.strictEqual((await post('/ingesta/ack', ana.token, { resultados: [{ id: c1.id, estado: 'raro' }] })).s, 400);

  // 4) vuelve: se aplica UNA vez, queda en el historial como "dueño desde el celular" y el panel lo ve Aplicado
  await PC.consultar(); assert.strictEqual(precioPC(P.id), nuevo);
  const aj = dbPC().ajustes.filter(a => a.tipo === 'producto.precio' && a.pid === P.id); assert.strictEqual(aj.length, 1); assert.strictEqual(aj[0].user, 'dueño desde el celular'); assert(/dueño desde el celular/.test(aj[0].txt));
  d = await datos('ana', ckA); assert.deepStrictEqual(d.cambios.map(c => c.estado), ['aplicado']); assert(d.cambios[0].resuelto);
  assert.deepStrictEqual((await pend(ana.token)).j.pendientes, [], 'ya no está pendiente');

  // 5) IDEMPOTENCIA: llega dos veces (se perdió la confirmación) y se aplica una sola vez
  const nuevo2 = Math.round(P2.price * 1.1 * 100) / 100; const c2 = (await pedir('ana', ckA, { pid: P2.id, precio: nuevo2, visto: P2.price })).j.cambio;
  perderAck = true; await PC.consultar(); perderAck = false; assert.strictEqual(precioPC(P2.id), nuevo2); assert.strictEqual((await datos('ana', ckA)).cambios.find(c => c.id === c2.id).estado, 'pendiente', 'el servidor no se enteró');
  await PC.consultar(); assert.strictEqual(dbPC().ajustes.filter(a => a.tipo === 'producto.precio' && a.pid === P2.id).length, 1, 'se aplicó una sola vez'); assert.strictEqual(precioPC(P2.id), nuevo2);
  assert.strictEqual((await datos('ana', ckA)).cambios.find(c => c.id === c2.id).estado, 'aplicado');
  assert.strictEqual((await post('/ingesta/ack', ana.token, { resultados: [{ id: c2.id, estado: 'rechazado', motivo: 'tarde' }] })).j.cambiados, 0, 'una confirmación repetida no cambia nada');
  assert.deepStrictEqual(aplicarEnPC([{ id: c2.id, pid: P2.id, precio: 1, visto: 1 }]).map(x => x.estado), ['aplicado'], 'el programa recuerda lo ya resuelto'); assert.strictEqual(precioPC(P2.id), nuevo2);

  // 6) CHOQUE: el precio cambió en el local desde lo que vio el dueño -> no se pisa, se rechaza y el panel avisa
  const P3 = X[2], visto3 = P3.price; const c3 = (await pedir('ana', ckA, { pid: P3.id, precio: Math.round(visto3 * 1.5 * 100) / 100, visto: visto3 })).j.cambio;
  w.eval(`db.prods.find(p => p.id === ${P3.id}).price = ${visto3 + 7}`);
  await PC.consultar(); assert.strictEqual(precioPC(P3.id), visto3 + 7, 'no se pisó el precio del local');
  const ch = (await datos('ana', ckA)).cambios.find(c => c.id === c3.id); assert.strictEqual(ch.estado, 'rechazado'); assert(/cambió en el local, revisalo/.test(ch.motivo));

  // 7) PERMISOS en la PC: si quien tiene la sesión no puede editar productos, no se toca nada y queda pendiente
  const P4 = X[3], c4 = (await pedir('ana', ckA, { pid: P4.id, precio: Math.round(P4.price * 2 * 100) / 100, visto: P4.price })).j.cambio;
  w.eval("AU.habilitado = true; AU.permisos = { productos: ['ver'] }"); await PC.consultar(); assert.strictEqual(precioPC(P4.id), P4.price); assert.strictEqual((await datos('ana', ckA)).cambios.find(c => c.id === c4.id).estado, 'pendiente');
  w.eval("AU.permisos = { productos: ['ver', 'editar'] }"); await PC.consultar(); assert.strictEqual(precioPC(P4.id), Math.round(P4.price * 2 * 100) / 100); w.eval('AU.habilitado = false');
  // un producto que ya no existe en el local
  const P5 = X[4], c5 = (await pedir('ana', ckA, { pid: P5.id, precio: Math.round(P5.price * 2 * 100) / 100, visto: P5.price })).j.cambio; w.eval(`db.prods = db.prods.filter(p => p.id !== ${P5.id})`);
  await PC.consultar(); assert(/ya no existe/.test((await datos('ana', ckA)).cambios.find(c => c.id === c5.id).motivo));

  // 8) AVISO DIRECTO: al mandar datos, el servidor avisa que hay novedades y la PC pregunta sin esperar su turno
  const P6 = X[5], c6 = (await pedir('ana', ckA, { pid: P6.id, precio: Math.round(P6.price * 1.3 * 100) / 100, visto: P6.price })).j.cambio;
  w.eval("db.sales.push({ id: 9001, date: new Date().toISOString(), items: [], total: 10, pay: 'Efectivo' })"); reloj += 3000; await PC.sincronizar(); await new Promise(r => setTimeout(r, 400));
  assert.strictEqual((await datos('ana', ckA)).cambios.find(c => c.id === c6.id).estado, 'aplicado', 'se aplicó al llegar el aviso, sin esperar la consulta periódica');
  assert.strictEqual(precioPC(P6.id), Math.round(P6.price * 1.3 * 100) / 100);

  // 9) el precio nuevo llega también a la foto del panel
  reloj += 3000; await PC.sincronizar(); d = await datos('ana', ckA); assert.strictEqual(d.foto.stock.find(s => s.id === P.id).precio, nuevo, 'el panel ya muestra el precio nuevo');

  // 10) AISLAMIENTO: lo de Ana nunca aparece en Beto
  assert.deepStrictEqual((await datos('beto', ckB)).cambios, []); assert.strictEqual((await pedir('beto', ckB, { pid: P.id, precio: nuevo, visto: P.price })).s, 404, 'ese producto no es de Beto');

  // 11) LÍMITE de pedidos por minuto
  reloj += 61000; let ult; for (let i = 0; i < 25; i++) ult = (await pedir('ana', ckA, { pid: P.id, precio: 0, visto: P.price })).s;
  assert.strictEqual(ult, 429, 'más de 20 pedidos por minuto se frenan'); reloj += 61000; assert.strictEqual((await pedir('ana', ckA, { pid: P.id, precio: 0, visto: P.price })).s, 400, 'pasado el minuto vuelve a funcionar');

  // 12) COSTO: consulta vacía = 1 comando; frecuencia adaptada a la actividad y la hora
  const c1m = SIM.comandos; await PC.consultar(); assert.strictEqual(SIM.comandos - c1m, 1, 'consulta periódica sin novedades: 1 comando');
  const esperas = []; let corre = null, R2 = reloj, c7 = {};
  const PC7 = crearPC({ leer: () => w.eval('JSON.stringify(db)'), getCfg: () => c7, setCfg: p => { c7 = { ...c7, ...p }; }, enviar: async () => ({ ok: true, status: 200, json: async () => ({ pendientes: [], cv: 0 }) }), ahora: () => R2, programar: () => 1, cancelar: () => {}, esperar: (f, ms) => { esperas.push(ms); if (ms >= 5000) corre = f; return 1; }, aplicar: async () => [] });
  PC7.configurar({ url: base, token: ana.token }); PC7.iniciar(); await new Promise(r => setTimeout(r, 50)); assert(esperas.includes(5000), 'primera consulta a los 5 s');
  const sig = async () => { const f = corre; esperas.length = 0; f && await f(); return esperas[esperas.length - 1]; };
  R2 = new Date(2026, 10, 22, 14, 0, 0).getTime(); PC7.avisar(); assert.strictEqual(await sig(), 60000, 'trabajando (guardado reciente): cada 60 s');
  R2 += 40 * 60000; assert.strictEqual(await sig(), 180000, 'quieto: cada 3 min');
  R2 = new Date(2026, 10, 23, 3, 0, 0).getTime(); assert.strictEqual(await sig(), 600000, 'de noche: cada 10 min');
  PC7.detener();
  console.log('MEDIDO consulta de pendientes: 1 comando | cada 60 s activo (~600/día en 10 h) + 3 min quieto + 10 min de noche = ~800/día = ~24 mil comandos/mes por comercio');
  await srv.close(); console.log('NUBE_PRECIOS_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
