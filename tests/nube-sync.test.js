// Sincronización rápida: envío por diferencias con id de operación, cola/reintentos de la PC, compatibilidad con programas viejos,
// aislamiento entre comercios, consumo de comandos y alerta de uso. Todo contra el servidor real sobre un Redis simulado
// (nunca la base real); la PC usa el cliente real (nube.js) con reloj y red controlados.
const assert = require('assert'), http = require('http');
const crearPC = require('../nube'), { proyeccion } = crearPC, { crear } = require('../nube/servidor'), { redis } = require('../nube/almacen');
(async () => {
  let reloj = Date.now(); const SIM = require('./redis-simulado')({ reloj: () => reloj }), ADMIN = 'a'.repeat(40), avisos = [];
  const srv = crear({ almacen: redis({ url: 'https://redis.prueba', token: 'tok', pedir: SIM.pedir, avisar: m => avisos.push(m), ahora: () => reloj }), adminToken: ADMIN, ahora: () => reloj, frescuraMs: 720000 });
  const puerto = await srv.listen(0, '127.0.0.1'), base = 'http://127.0.0.1:' + puerto;
  const J = async (u, o = {}) => { const r = await fetch(base + u, o); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, r }; };
  const adm = (u, b) => J(u, { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const ana = (await adm('/admin/comercios', { nombre: 'Kiosco Ana', sub: 'ana' })).j, beto = (await adm('/admin/comercios', { nombre: 'Almacen Beto', sub: 'beto' })).j;
  const entrar = async (sub, clave) => { const r = await fetch(base + '/c/' + sub + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave }) }); return r.headers.get('set-cookie').split(';')[0]; };
  const ckA = await entrar('ana', ana.clave), ckB = await entrar('beto', beto.clave);
  const datos = async (sub, ck) => (await J('/c/' + sub + '/api/datos', { headers: { Cookie: ck } })).j, ver = async (sub, ck) => J('/c/' + sub + '/api/ver', { headers: { Cookie: ck } });
  const post = (ruta, tok, cuerpo) => J(ruta, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

  // ---- la PC de Ana: cliente real, red controlada ----
  const db = { shop: { n: 'Kiosco Ana' }, cfg: {}, prods: [1, 2, 3, 4].map(i => ({ id: i, name: 'Prod ' + i, code: 'c' + i, price: 100 * i, lots: [{ id: i, n: 'L', qty: 100000, exp: '' }] })), clients: [], sales: [], cajas: [], pays: [], cargos: [], desv: [] };
  let nId = 0; const vender = () => { const id = ++nId; db.sales.push({ id, date: new Date(reloj).toISOString(), items: [{ id: 1, name: 'Prod 1', qty: 1, price: 100 }], total: 100, pay: 'Efectivo' }); db.prods[id % 4].lots[0].qty -= 1; return id; };
  let red = 'ok'; const enviados = [];
  const enviar = async (u, o) => {
    if (red === 'caida') throw new TypeError('fetch failed');
    enviados.push({ u: u.replace(base, ''), body: JSON.parse(o.body) });
    const r = await fetch(u, o);
    if (red === 'perdida') throw new TypeError('respuesta perdida');   // el servidor ya aplicó el envío pero la PC no se entera
    return r;
  };
  let cfg = {}; const timers = [];
  const PC = crearPC({ leer: () => JSON.stringify(db), getCfg: () => cfg, setCfg: p => { cfg = { ...cfg, ...p }; }, enviar, ahora: () => reloj, programar: () => 1, cancelar: () => {}, esperar: (f, ms) => { const t = { f, ms }; timers.push(t); return t; }, noEsperar: () => {} });
  assert(PC.configurar({ url: base, token: ana.token }).ok);
  const ids = j => j.foto.ventas.map(v => v.id).sort((a, b) => a - b);

  // 1) primera vez: foto entera, repartida en base + ventas por día
  vender(); vender(); await PC.sincronizar();
  assert.strictEqual(enviados[0].u, '/ingesta'); assert(enviados[0].body.inst && enviados[0].body.n === 1);
  assert([...SIM.R.keys()].some(k => k.startsWith('sp:base:')) && [...SIM.R.keys()].some(k => k.startsWith('sp:vd:')) && ![...SIM.R.keys()].some(k => k.startsWith('sp:foto:')), 'se guarda por partes, no en un solo documento');
  let d = await datos('ana', ckA); assert.deepStrictEqual(ids(d), [1, 2]); assert.strictEqual(d.foto.stock.length, 4); assert(!('k' in d.foto.stock[0]), 'la clave interna no sale al panel'); assert.strictEqual(d.foto.negocio.nombre, 'Kiosco Ana');
  const v0 = (await ver('ana', ckA)).j.v; assert.strictEqual(d.ver, v0, 'datos y ver hablan de la misma versión');

  // 2) una venta = un envío chico por diferencias (solo esa venta y el stock que cambió)
  vender(); enviados.length = 0; reloj += 3000; await PC.sincronizar();
  assert.strictEqual(enviados.length, 1); assert.strictEqual(enviados[0].u, '/ingesta/ops'); assert.deepStrictEqual(enviados[0].body.ventas.map(v => v.id), [3]); assert(enviados[0].body.stock.length <= 1, 'solo el producto que cambió');
  const ultimoOps = enviados[0].body; d = await datos('ana', ckA); assert.deepStrictEqual(ids(d), [1, 2, 3]); const v1 = (await ver('ana', ckA)).j.v; assert.notStrictEqual(v1, v0, 'la versión cambia con cada dato nuevo');

  // 3) IDEMPOTENCIA: el mismo envío otra vez no duplica ni cambia la versión
  for (let i = 0; i < 3; i++) { const r = await post('/ingesta/ops', ana.token, ultimoOps); assert.strictEqual(r.s, 200); assert(r.j.repetido, 'repetido'); }
  d = await datos('ana', ckA); assert.deepStrictEqual(ids(d), [1, 2, 3]); assert.strictEqual((await ver('ana', ckA)).j.v, v1);

  // 4) ORDEN: un envío adelantado o de otra ejecución del programa no se aplica; pide foto entera
  let r = await post('/ingesta/ops', ana.token, { ...ultimoOps, n: ultimoOps.n + 5 }); assert.strictEqual(r.s, 409); assert(r.j.pedirFoto);
  r = await post('/ingesta/ops', ana.token, { ...ultimoOps, n: ultimoOps.n + 1, inst: 'otraEjecucion1' }); assert.strictEqual(r.s, 409);
  r = await post('/ingesta/ops', ana.token, { inst: 'x', n: 'uno' }); assert.strictEqual(r.s, 400, 'valida el formato');
  r = await post('/ingesta/ops', ana.token, { ...ultimoOps, n: ultimoOps.n + 1, ventas: [{ id: 99 }] }); assert.strictEqual(r.s, 400, 'una venta sin fecha se rechaza');
  d = await datos('ana', ckA); assert.deepStrictEqual(ids(d), [1, 2, 3], 'nada de eso modificó los datos');

  // 5) RESPUESTA PERDIDA: el servidor aplicó el envío pero la PC no lo supo; reintenta igual y no se duplica
  vender(); red = 'perdida'; reloj += 3000; let e = await PC.sincronizar(); assert(/Sin conexión/.test(e.error));
  assert.deepStrictEqual(ids(await datos('ana', ckA)), [1, 2, 3, 4], 'ya estaba aplicado');
  vender(); red = 'ok'; enviados.length = 0; reloj += 2500; e = await PC.sincronizar(); assert(!e.error, 'se recupera: ' + e.error);
  assert.strictEqual(enviados.length, 1); assert.deepStrictEqual(enviados[0].body.ventas.map(v => v.id), [4], 'se repite EXACTAMENTE el envío sin confirmar (mismo n)');
  reloj += 3000; await PC.sincronizar(); assert.deepStrictEqual(ids(await datos('ana', ckA)), [1, 2, 3, 4, 5], 'la venta nueva sale en el envío siguiente, sin duplicar la anterior');

  // 6) CORTES DE INTERNET al azar durante 500 ventas: al volver, el servidor tiene exactamente lo mismo que la PC
  let semilla = 7; const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 100; i++) { for (let k = 0; k < 5; k++) vender(); const x = azar(); red = x < 0.35 ? 'caida' : x < 0.55 ? 'perdida' : 'ok'; reloj += 61000; await PC.sincronizar(); }
  red = 'ok'; for (let i = 0; i < 4; i++) { reloj += 61000; await PC.sincronizar(); }
  d = await datos('ana', ckA); assert.strictEqual(d.foto.ventas.length, db.sales.length); assert.deepStrictEqual(ids(d), db.sales.map(s => s.id).sort((a, b) => a - b), 'sin pérdidas ni duplicados');
  const proy = JSON.parse(JSON.stringify(proyeccion(db, reloj))); assert.deepStrictEqual(d.foto.stock, proy.stock, 'el stock del servidor es igual al de la PC'); assert.deepStrictEqual(d.foto.cajas, proy.cajas); assert.deepStrictEqual(d.foto.ventas.slice().sort((a, b) => a.id - b.id), proy.ventas.slice().sort((a, b) => a.id - b.id));
  console.log('MEDIDO ventas:', db.sales.length, '| envíos hechos:', enviados.length);

  // 7) espera creciente: un corte largo no martilla al servidor
  vender(); red = 'ok';
  let tent = 0; const enviarCuenta = async (u, o) => { tent++; throw new TypeError('fetch failed'); };
  let cfg3 = {}; const PC3 = crearPC({ leer: () => JSON.stringify(db), getCfg: () => cfg3, setCfg: p => { cfg3 = { ...cfg3, ...p }; }, enviar: enviarCuenta, ahora: () => reloj, programar: () => 1, cancelar: () => {} }); PC3.configurar({ url: base, token: ana.token });
  const t0 = reloj; for (let s = 0; s <= 120; s++) { reloj = t0 + s * 1000; await PC3.sincronizar(); }
  assert(tent <= 8, 'en 2 minutos de corte hace pocos intentos (' + tent + ')'); console.log('MEDIDO intentos en 2 min de corte:', tent);
  reloj += 61000; await PC.sincronizar();

  // 8) debounce: muchos guardados seguidos = un solo envío, a ~1 s
  timers.length = 0; PC.avisar(); PC.avisar(); PC.avisar(); assert.strictEqual(timers.length, 1, 'un solo temporizador'); assert(timers[0].ms >= 1000 && timers[0].ms <= 3000);

  // 9) COMPATIBILIDAD con programas viejos: foto entera sin inst/n
  const fotoVieja = { v: 1, generado: new Date(reloj).toISOString(), negocio: { nombre: 'Almacen Beto' }, ventas: [{ id: 1, total: 100 }], stock: [{ n: 'Pan', precio: 5, disp: 3, estado: 'ok' }] };
  r = await post('/ingesta', beto.token, { seq: 10, foto: fotoVieja }); assert.strictEqual(r.s, 200); assert((await post('/ingesta', beto.token, { seq: 10, foto: fotoVieja })).j.repetido);
  assert(SIM.R.get('sp:foto:' + beto.id).startsWith('gz:'), 'un programa viejo sigue guardándose como siempre'); d = await datos('beto', ckB); assert.deepStrictEqual(d.foto.ventas, fotoVieja.ventas); assert(d.ver);
  assert.strictEqual((await post('/ingesta/ops', beto.token, { inst: 'unaInstalacion', n: 1, ventas: [] })).s, 409, 'sobre una foto vieja, las diferencias piden foto entera');
  const bVer = (await ver('beto', ckB)).j.v; assert.strictEqual(typeof bVer, 'string');
  await post('/ingesta', beto.token, { seq: 11, foto: { ...fotoVieja, ventas: [{ id: 1, total: 100 }, { id: 2, total: 5 }] } }); assert.notStrictEqual((await ver('beto', ckB)).j.v, bVer, 'también cambia la versión con un programa viejo');
  // un programa nuevo sobre un comercio que venía con uno viejo pasa a diferencias y limpia el documento único
  let cfgB = {}; const dbB = { shop: { n: 'Almacen Beto' }, prods: [{ id: 1, name: 'Pan', price: 5, lots: [{ id: 1, n: 'A', qty: 3, exp: '' }] }], sales: [{ id: 7, date: new Date(reloj).toISOString(), items: [], total: 9, pay: 'Efectivo' }], cajas: [], clients: [], pays: [], cargos: [], desv: [] };
  const PCB = crearPC({ leer: () => JSON.stringify(dbB), getCfg: () => cfgB, setCfg: p => { cfgB = { ...cfgB, ...p }; }, enviar: (u, o) => fetch(u, o), ahora: () => reloj, programar: () => 1, cancelar: () => {} }); PCB.configurar({ url: base, token: beto.token });
  reloj += 5000; assert(!(await PCB.sincronizar()).error); assert(!SIM.R.has('sp:foto:' + beto.id), 'se limpia el documento único'); d = await datos('beto', ckB); assert.deepStrictEqual(ids(d), [7]);
  // y vuelve un programa viejo (se reinstaló una versión anterior): el servidor lo acepta de nuevo
  assert.strictEqual((await post('/ingesta', beto.token, { seq: reloj + 1e6, foto: fotoVieja })).s, 200); d = await datos('beto', ckB); assert.deepStrictEqual(d.foto.ventas, fotoVieja.ventas);
  // servidor viejo (sin /ingesta/ops): el programa nuevo cae a mandar la foto entera como antes
  let c4 = {}, vistos = []; const dbC = { ...dbB };
  const PC4 = crearPC({ leer: () => JSON.stringify(dbC), getCfg: () => c4, setCfg: p => { c4 = { ...c4, ...p }; }, enviar: async (u, o) => { vistos.push(u.replace(base, '')); if (u.endsWith('/ops')) return { ok: false, status: 404 }; return { ok: true, status: 200 }; }, ahora: () => reloj, programar: () => 1, cancelar: () => {} });
  PC4.configurar({ url: base, token: beto.token }); await PC4.sincronizar(); dbC.sales = [...dbB.sales, { id: 8, date: new Date(reloj).toISOString(), items: [], total: 1, pay: 'Efectivo' }]; reloj += 3000; await PC4.sincronizar();
  assert.deepStrictEqual(vistos, ['/ingesta', '/ingesta/ops', '/ingesta'], 'ante un 404 de ops manda la foto entera');

  // 10) AISLAMIENTO entre comercios
  const antesAna = ids(await datos('ana', ckA)); await post('/ingesta/ops', beto.token, { inst: 'unaInstalacion', n: 2, ventas: [{ id: 5000, fecha: new Date(reloj).toISOString() }] });
  assert.deepStrictEqual(ids(await datos('ana', ckA)), antesAna, 'lo de Beto no aparece en Ana');
  r = await ver('beto', ckA); assert.strictEqual(r.s, 401, 'la sesión de Ana no sirve en Beto'); r = await J('/c/beto/api/datos', { headers: { Cookie: ckA } }); assert.strictEqual(r.s, 401);
  assert.strictEqual((await post('/ingesta/ops', 'spn_' + 'b'.repeat(48), { inst: 'unaInstalacion', n: 1 })).s, 401);

  // 11) /api/ver: mínimo, sin datos del negocio, guardable en la CDN solo si es 200 y sin mezclar comercios
  r = await ver('ana', ckA); assert.deepStrictEqual(Object.keys(r.j).sort(), ['v', 'viejo']); assert(/^[0-9a-f]{12}$/.test(r.j.v)); const cc = r.r.headers.get('cache-control'); assert(/s-maxage=1/.test(cc) && /stale-while-revalidate/.test(cc) && /public/.test(cc), cc);
  assert(!JSON.stringify(r.j).includes('Kiosco') && !JSON.stringify(r.j).includes('store_'), 'sin datos del negocio');
  const antesCmd = SIM.comandos; r = await J('/c/ana/api/ver'); assert.strictEqual(r.s, 401); assert.strictEqual(r.r.headers.get('cache-control'), 'no-store', 'los errores nunca se guardan'); assert.strictEqual(SIM.comandos, antesCmd, 'sin sesión no se gasta ningún comando');
  assert.strictEqual((await J('/c/ana/api/ver', { method: 'POST', headers: { Cookie: ckA } })).s, 405);

  // 12) COSTO en comandos de Upstash (cada comando del pipeline cuenta; el INCRBY del contador de uso se prorratea)
  const med = async f => { const c0 = SIM.comandos, p0 = SIM.peticiones; await f(); return { cmd: SIM.comandos - c0, http: SIM.peticiones - p0 }; };
  vender(); reloj += 3000; const mEnvio = await med(() => PC.sincronizar()); const mLatido = await med(async () => { reloj += 601000; await PC.sincronizar(); });
  const mVer = await med(() => ver('ana', ckA)), mDatos = await med(() => datos('ana', ckA));
  console.log('MEDIDO comandos -> envío de una venta:', mEnvio.cmd, '(' + mEnvio.http + ' pedidos HTTP) | latido:', mLatido.cmd, '| consulta de versión:', mVer.cmd, '| bajar datos:', mDatos.cmd);
  assert(mEnvio.cmd <= 9 && mEnvio.http <= 6, 'envío de una venta'); assert(mLatido.cmd <= 8, 'latido'); assert(mVer.cmd <= 2, 'consulta de versión'); const mVer2 = await med(() => ver('ana', ckA)); console.log('MEDIDO consulta de versión repetida (sesión recordada 10 s):', mVer2.cmd); assert(mVer2.cmd <= 1, 'la segunda consulta seguida cuesta 1 comando'); assert(mDatos.cmd <= 4, 'bajar datos');
  const mFoto = await med(() => PC.sincronizar(true)); console.log('MEDIDO comandos -> foto entera de reparación (sin cambios):', mFoto.cmd);

  // 13) alerta al pasar el 70 % del cupo mensual
  const av = []; const S2 = crear({ almacen: redis({ url: 'https://redis.prueba', token: 'tok', pedir: require('./redis-simulado')({ reloj: () => reloj }).pedir, limite: 60, avisar: m => av.push(m), ahora: () => reloj }), adminToken: ADMIN, ahora: () => reloj });
  const p2 = await S2.listen(0, '127.0.0.1'); const J2 = async u => { const x = await fetch('http://127.0.0.1:' + p2 + u); return x.json(); };
  assert.deepStrictEqual(await J2('/salud'), { ok: true });
  for (let i = 0; i < 40 && !av.length; i++) await fetch('http://127.0.0.1:' + p2 + '/admin/comercios', { headers: { Authorization: 'Bearer ' + ADMIN } });
  assert(av.length >= 1 && /\d+ %/.test(av[0]), 'avisa en el log al pasar el 70 %: ' + av[0]); const s = await J2('/salud'); assert(s.aviso && s.uso.pct >= 70, 'y /salud lo muestra'); assert(!JSON.stringify(s).includes(ADMIN));
  await S2.close();

  await srv.close(); console.log('NUBE_SYNC_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
