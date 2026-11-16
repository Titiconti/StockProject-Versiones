// El servidor del panel funcionando "sin memoria" (como en Vercel): datos en una base Redis simulada, varias copias
// del servidor a la vez, direcciones del tipo /c/<comercio> y la entrada nube/api/index.js.
const assert = require('assert'), http = require('http'), zlib = require('zlib');
const { crear } = require('../nube/servidor'), { redis } = require('../nube/almacen');
(async () => {
  // Redis simulado (la API REST de Upstash), con INCR, PEXPIRE y SET NX/PX.
  let reloj = Date.now(); const SIM = require('./redis-simulado')({ reloj: () => reloj }), R = SIM.R, pedir = SIM.pedir;
  const ADMIN = 'a'.repeat(40);
  const copia = () => crear({ almacen: redis({ url: 'https://redis.prueba', token: 'tok', pedir }), recargar: true, adminToken: ADMIN, ahora: () => reloj, frescuraMs: 420000 });
  // Dos copias del servidor que no comparten memoria (como dos funciones distintas): se alternan en cada pedido.
  const A = copia(), B = copia(); let turno = 0;
  const srv = http.createServer((q, s) => (turno++ % 2 ? A : B).manejar(q, s)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const J = async (u, o = {}) => { const r = await fetch(base + u, o); let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, t, r }; };
  const adm = (u, b) => J(u, { method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const ana = (await adm('/admin/comercios', { nombre: 'Kiosco Ana', sub: 'ana' })).j, beto = (await adm('/admin/comercios', { nombre: 'Almacén Beto', sub: 'beto' })).j;
  assert(ana.token && beto.token && ana.id !== beto.id, 'altas hechas por copias distintas no se pisan'); assert.strictEqual(ana.url, '/c/ana', 'sin dominio propio la dirección es por ruta');
  assert.strictEqual((await J('/admin/comercios', { headers: { Authorization: 'Bearer ' + ADMIN } })).j.length, 2);
  // ingesta: la recibe una copia y la lee la otra
  const enviar = (tok, seq, foto) => J('/ingesta', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ seq, foto }) });
  const foto = { v: 1, negocio: { nombre: 'Kiosco Ana' }, ventas: [{ id: 1, total: 100 }] };
  assert.strictEqual((await enviar(ana.token, 10, foto)).s, 200); assert((await enviar(ana.token, 10, foto)).j.repetido, 'idempotente entre copias');
  assert(R.get('sp:foto:' + ana.id).startsWith('gz:'), 'la foto se guarda comprimida'); assert.deepStrictEqual(JSON.parse(zlib.gunzipSync(Buffer.from(R.get('sp:foto:' + ana.id).slice(3), 'base64')).toString()), foto);
  assert(!JSON.stringify([...R.values()]).includes(ana.token) && !JSON.stringify([...R.values()]).includes(ana.clave), 'la base no guarda claves ni tokens en claro');
  // panel por ruta: página, login y datos (cada pedido cae en una copia distinta)
  const pag = await J('/c/ana'); assert.strictEqual(pag.s, 200); assert(pag.t.includes('/c/ana/api/') && !/['"`]\/api\//.test(pag.t), 'el panel llama a las direcciones de su comercio');
  assert.strictEqual((await J('/c/nadie')).s, 404);
  const login = async (sub, clave) => { const r = await fetch(base + '/c/' + sub + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave }) }); return { s: r.status, c: (r.headers.get('set-cookie') || '') }; };
  const la = await login('ana', ana.clave); assert.strictEqual(la.s, 200); assert(/Path=\/c\/ana;/.test(la.c), 'la cookie queda limitada a ese comercio'); const ck = la.c.split(';')[0];
  let d = await J('/c/ana/api/datos', { headers: { Cookie: ck } }); assert.strictEqual(d.s, 200); assert.strictEqual(d.j.foto.ventas[0].total, 100); assert.strictEqual(d.j.desactualizado, false);
  d = await J('/c/ana/api/datos', { headers: { Cookie: ck } }); assert.strictEqual(d.s, 200, 'la sesión vale en la otra copia');
  // aislamiento y solo lectura
  assert.strictEqual((await J('/c/beto/api/datos', { headers: { Cookie: ck } })).s, 401); assert.strictEqual((await login('beto', ana.clave)).s, 401);
  for (const m of ['POST', 'PUT', 'DELETE']) assert((await J('/c/ana/api/datos', { method: m, headers: { Cookie: ck } })).s >= 400);
  assert.strictEqual((await J('/c/ana/admin/comercios', { headers: { Authorization: 'Bearer ' + ADMIN } })).s, 404, 'administración nunca bajo la dirección de un comercio');
  // el bloqueo por intentos fallidos se mantiene aunque cada intento caiga en otra copia
  for (let i = 0; i < 4; i++) assert.strictEqual((await login('beto', 'mala' + i)).s, 401);   /* más el intento fallido de arriba: 5 */ assert.strictEqual((await login('beto', beto.clave)).s, 429);
  // frescura: 7 minutos sin noticias
  reloj += 419000; assert.strictEqual((await J('/c/ana/api/datos', { headers: { Cookie: ck } })).j.desactualizado, false); reloj += 2000; assert.strictEqual((await J('/c/ana/api/datos', { headers: { Cookie: ck } })).j.desactualizado, true);
  // revocar la clave de instalación
  await adm('/admin/comercios/' + ana.id + '/token'); assert.strictEqual((await enviar(ana.token, 99, foto)).s, 401);
  srv.close(); srv.closeAllConnections();

  // ---- entrada de Vercel: mensajes claros si falta configurar, y reenvío por __ruta ----
  const cargar = env => { delete require.cache[require.resolve('../nube/api/index.js')]; Object.assign(process.env, env); return require('../nube/api/index.js'); };
  const llamar = (h, url) => new Promise(res => { const r = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, end(b) { res({ s: this.statusCode, b: String(b || '') }); } }; h({ url, method: 'GET', headers: {} }, r); });
  delete process.env.ADMIN_TOKEN; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  let r = await llamar(cargar({}), '/api/index?__ruta=/salud'); assert.strictEqual(r.s, 503); assert(/ADMIN_TOKEN/.test(r.b));
  r = await llamar(cargar({ ADMIN_TOKEN: ADMIN }), '/api/index?__ruta=/salud'); assert.strictEqual(r.s, 503); assert(/base de datos/.test(r.b) && !r.b.includes(ADMIN));
  const h = cargar({ ADMIN_TOKEN: ADMIN, KV_REST_API_URL: 'https://redis.prueba', KV_REST_API_TOKEN: 'tok' });
  const s2 = http.createServer(h); await new Promise(x => s2.listen(0, '127.0.0.1', x));
  const sal = await (await fetch('http://127.0.0.1:' + s2.address().port + '/api/index?__ruta=/salud')).json(); assert.deepStrictEqual(sal, { ok: true }, 'la función reenvía a la ruta original');
  s2.close(); s2.closeAllConnections(); delete process.env.ADMIN_TOKEN; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  assert(SIM.comandos > 10); for (const c of ['INCR', 'PEXPIRE', 'SET', 'MGET']) assert(SIM.usados.has(c), 'se usó ' + c); console.log('NUBE_VERCEL_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
