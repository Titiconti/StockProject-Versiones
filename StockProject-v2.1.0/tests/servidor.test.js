const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { spawn } = require('child_process');
// Node reutiliza conexiones: tras reiniciar el servidor, reintenta una vez (como hacen los navegadores).
const _fetch = global.fetch;
const fetch = async (u, o) => { try { return await _fetch(u, o); } catch (e) { return _fetch(u, o); } };
const crearStore = require('../store.js'), { crearServidor, gestor } = require('../servidor.js');
const INDEX = path.join(__dirname, '..', 'index.html');

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-srv-'));
  const store = crearStore({ dataFile: path.join(base, 'd', 'data.json'), configFile: path.join(base, 'd', 'cfg.json'), docsDir: path.join(base, 'docs'), home: base });
  store.load();
  const g = gestor({ store, indexPath: INDEX, defaults: { demo: false, shop: { n: 'Kiosco' }, puertoRemoto: 0 } });
  const i0 = await g.start(); assert(i0.running && i0.port > 0, 'servidor iniciado'); assert(/^\d{6}$/.test(i0.pin), 'clave de 6 dígitos generada');
  const URL0 = 'http://127.0.0.1:' + i0.port, pin = i0.pin;
  const j = (r) => r.json();
  const f = (p, o = {}, cookie) => fetch(URL0 + p, { redirect: 'manual', ...o, headers: { ...(o.headers || {}), ...(cookie ? { cookie } : {}) } });

  // sin sesión: no hay acceso a nada
  let r = await f('/'); assert.strictEqual(r.status, 302); assert.strictEqual(r.headers.get('location'), '/login');
  r = await f('/api/rev'); assert.strictEqual(r.status, 401); r = await f('/api/db'); assert.strictEqual(r.status, 401);
  r = await f('/api/backup'); assert.strictEqual(r.status, 401);
  r = await f('/api/db?base=0', { method: 'PUT', body: '{"prods":[]}' }); assert.strictEqual(r.status, 401);
  r = await f('/login'); assert.strictEqual(r.status, 200); assert(/Clave de acceso|clave de acceso/i.test(await r.text()));
  // cookie falsificada o vencida
  r = await f('/api/rev', {}, 'sp_token=9999999999999.abc'); assert.strictEqual(r.status, 401);
  r = await f('/api/rev', {}, 'sp_token=1.deadbeef'); assert.strictEqual(r.status, 401);

  // clave incorrecta -> 401 ; correcta -> cookie
  r = await f('/api/login', { method: 'POST', body: JSON.stringify({ pin: '000000' }) }); assert.strictEqual(r.status, 401);
  r = await f('/api/login', { method: 'POST', body: JSON.stringify({ pin }) }); assert.strictEqual(r.status, 200);
  const sc = r.headers.get('set-cookie'); assert(/sp_token=/.test(sc) && /HttpOnly/.test(sc) && /SameSite=Lax/.test(sc));
  const C = sc.split(';')[0];

  // datos: versión, guardado y conflicto
  assert.strictEqual((await j(await f('/api/rev', {}, C))).rev, 0);
  assert.strictEqual((await (await f('/api/db', {}, C)).text()), 'null', 'sin datos todavía');
  r = await f('/', {}, C); let html = await r.text(); assert.strictEqual(r.status, 200); assert(html.includes('window.SP_BOOT={"rev":0,"data":null'), 'datos iniciales inyectados'); assert(/"shop":\{"n":"Kiosco"\}/.test(html));
  const put = (b, base_) => f('/api/db?base=' + base_, { method: 'PUT', body: JSON.stringify(b) }, C);
  r = await put({ prods: [{ id: 1, name: 'A</script><b>' }], v: 1 }, 0); assert.strictEqual(r.status, 200); assert.deepStrictEqual(await j(r), { ok: true, rev: 1 });
  r = await put({ prods: [], v: 'viejo' }, 0); assert.strictEqual(r.status, 409, 'versión vieja: conflicto'); assert.strictEqual((await j(r)).rev, 1);
  assert.strictEqual(JSON.parse(await (await f('/api/db', {}, C)).text()).v, 1, 'el conflicto no pisó los datos');
  r = await put({ prods: [], v: 2 }, 1); assert.strictEqual((await j(r)).rev, 2);
  r = await f('/api/db?base=2', { method: 'PUT', body: '{roto' }, C); assert.strictEqual(r.status, 400);
  r = await f('/api/db?base=2', { method: 'PUT', body: '{"x":1}' }, C); assert.strictEqual(r.status, 400, 'sin prods no se acepta');
  r = await f('/api/db', { method: 'PUT', body: '{"prods":[]}' }, C); assert.strictEqual(r.status, 400, 'falta base');
  assert.strictEqual(store.rev(), 2); assert.strictEqual(JSON.parse(fs.readFileSync(path.join(base, 'd', 'data.json'), 'utf8')).rev, 2, 'la versión queda en el archivo');
  // el HTML inyecta los datos más recientes y no se puede cerrar la etiqueta <script> con datos del usuario
  await put({ prods: [{ id: 1, name: 'X</script><img src=x onerror=alert(1)>' }] }, 2);
  html = await (await f('/', {}, C)).text(); assert(!/<\/script><img/.test(html), 'datos escapados'); assert(html.includes('"rev":3'));

  // copia de seguridad en un solo archivo
  r = await f('/api/backup', {}, C); assert.strictEqual(r.status, 200); assert(/attachment; filename="StockProject-copia-\d{4}-\d\d-\d\d\.json"/.test(r.headers.get('content-disposition')));
  assert.strictEqual(await r.text(), fs.readFileSync(path.join(base, 'd', 'data.json'), 'utf8'), 'la copia es exactamente el archivo de datos');
  // restaurar sube la versión (los otros dispositivos recargan)
  const tmp = path.join(base, 'copia.json'); fs.writeFileSync(tmp, JSON.stringify({ prods: [{ id: 9 }], rev: 1 }));
  assert(store.restoreFrom(tmp)); assert.strictEqual(store.rev(), 4); assert.strictEqual((await j(await f('/api/rev', {}, C))).rev, 4);

  // cambiar la clave cierra las sesiones y la clave vieja deja de servir
  const nuevo = await g.setConfig({ pin: 'Clave2026' }); assert.strictEqual(nuevo.pin, 'Clave2026'); assert(nuevo.running);
  const URL1 = 'http://127.0.0.1:' + nuevo.port;
  r = await fetch(URL1 + '/api/rev', { headers: { cookie: C } }); assert.strictEqual(r.status, 401, 'sesión anterior cerrada');
  r = await fetch(URL1 + '/api/login', { method: 'POST', body: JSON.stringify({ pin }) }); assert.strictEqual(r.status, 401);
  r = await fetch(URL1 + '/api/login', { method: 'POST', body: JSON.stringify({ pin: 'Clave2026' }) }); assert.strictEqual(r.status, 200);
  assert.strictEqual((await g.setConfig({ pin: 'ab' })).error, 'La clave debe tener entre 4 y 12 letras o números');
  assert.strictEqual(g.info().pin, 'Clave2026', 'una clave inválida no cambia nada');

  // límite de intentos: 5 fallos y se bloquea (aunque después llegue la clave correcta)
  for (let k = 0; k < 5; k++) { r = await fetch(URL1 + '/api/login', { method: 'POST', body: JSON.stringify({ pin: 'mala' + k }) }); assert.strictEqual(r.status, 401); }
  r = await fetch(URL1 + '/api/login', { method: 'POST', body: JSON.stringify({ pin: 'mala5' }) }); assert.strictEqual(r.status, 429);
  r = await fetch(URL1 + '/api/login', { method: 'POST', body: JSON.stringify({ pin: 'Clave2026' }) }); assert.strictEqual(r.status, 429, 'bloqueado aunque la clave sea correcta');

  // desactivar / activar, y la configuración persiste
  assert.strictEqual((await g.setConfig({ enabled: false })).running, false);
  await assert.rejects(() => fetch(URL1 + '/login'), 'apagado: no responde');
  const g2 = gestor({ store, indexPath: INDEX, defaults: { puertoRemoto: 0 } }); assert.strictEqual(g2.info().enabled, false, 'se acuerda que estaba desactivado'); assert.strictEqual(g2.info().pin, 'Clave2026', 'se acuerda la clave');
  assert((await g.setConfig({ enabled: true })).running); g.stop();

  // si el puerto está ocupado usa el siguiente
  const net = require('net'), ocupa = net.createServer().listen(0, '0.0.0.0'); await new Promise(r => ocupa.once('listening', r));
  const pBusy = ocupa.address().port, g3 = gestor({ store, indexPath: INDEX, defaults: {} }), i3 = await g3.setConfig({ enabled: true, port: pBusy });
  assert(i3.running && i3.port > pBusy && i3.port <= pBusy + 10, 'puerto alternativo: ' + i3.port); g3.stop(); ocupa.close();

  // modo "solo servidor" (sin pantalla)
  const datos = path.join(base, 'cli');
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'servidor-cli.js'), '--datos', datos, '--puerto', '3470', '--clave', 'cli12345'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  for (let k = 0; k < 40 && !/Clave de acceso/.test(out); k++) await new Promise(r => setTimeout(r, 100));
  assert(/Clave de acceso: cli12345/.test(out), out);
  const m = out.match(/localhost:(\d+)|:(\d{4,5})/); const puerto = (m && (m[1] || m[2])) || '3470';
  r = await fetch('http://127.0.0.1:' + puerto + '/api/login', { method: 'POST', body: JSON.stringify({ pin: 'cli12345' }) }); assert.strictEqual(r.status, 200, 'el modo servidor responde');
  p.kill();
  console.log('SERVIDOR_OK');process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
