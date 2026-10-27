const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const crearStore = require('../store.js'), crearUsr = require('../usuarios.js'), { gestor } = require('../servidor.js');
(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-srvu-'));
  const store = crearStore({ dataFile: path.join(base, 'd.json'), configFile: path.join(base, 'c.json'), docsDir: base, home: base }); store.load();
  const usr = crearUsr({ usersFile: path.join(base, 'u.json'), auditFile: path.join(base, 'a.jsonl') });
  const g = gestor({ store, usuarios: usr, indexPath: path.join(__dirname, '..', 'index.html'), defaults: { puertoRemoto: 0 } });
  const i = await g.start(), U = 'http://127.0.0.1:' + i.port;
  const f = (p, o = {}, c) => fetch(U + p, { redirect: 'manual', ...o, headers: { ...(o.headers || {}), ...(c ? { cookie: c } : {}) } });
  const post = (p, b, c) => f(p, { method: 'POST', body: JSON.stringify(b) }, c);
  // sin usuarios: sigue valiendo la clave única de siempre
  let r = await post('/api/login', { pin: i.pin }); assert.strictEqual(r.status, 200); const viejo = r.headers.get('set-cookie').split(';')[0];
  // sin usuarios no se puede crear el primero por la vía remota
  assert.strictEqual((await post('/api/auth/crear', { args: [{ user: 'x1x', rol: 'admin', clave: 'Clave1234' }] }, viejo)).status, 404);
  // se activan usuarios (lo hace la PC principal)
  assert(usr.crear(null, { user: 'ana', rol: 'admin', clave: 'Clave1234' }).ok);
  assert((await (await f('/login')).text()).includes('Usuario'), 'la pantalla pide usuario');
  assert.strictEqual((await f('/api/rev', {}, viejo)).status, 401, 'la cookie de clave única deja de servir');
  assert.strictEqual((await post('/api/login', { pin: i.pin })).status, 401, 'la clave única ya no entra');
  assert.strictEqual((await post('/api/login', { user: 'ana', pass: 'mala' })).status, 401);
  r = await post('/api/login', { user: 'ana', pass: 'Clave1234' }); assert.strictEqual(r.status, 200); const CA = r.headers.get('set-cookie').split(';')[0];
  const adm = usr.sesion(CA.split('=')[1]);
  assert(usr.crear(adm, { user: 'vera', rol: 'consulta', clave: 'Clave1234' }).ok && usr.crear(adm, { user: 'luis', rol: 'empleado', clave: 'Clave1234' }).ok);
  const cook = async (u) => (await post('/api/login', { user: u, pass: 'Clave1234' })).headers.get('set-cookie').split(';')[0];
  const CV = await cook('vera'), CL = await cook('luis');
  // datos: admin y empleado escriben, consulta no
  const put = (c, n) => f('/api/db?base=' + n, { method: 'PUT', body: JSON.stringify({ prods: [] }) }, c);
  assert.strictEqual((await put(CV, 0)).status, 403); assert.strictEqual((await put(CL, 0)).status, 200); assert.strictEqual((await put(CA, 1)).status, 200);
  assert.strictEqual((await f('/api/db', {}, CV)).status, 200, 'consulta puede leer');
  // respaldo: solo quien tiene permiso
  assert.strictEqual((await f('/api/backup', {}, CL)).status, 403); assert.strictEqual((await f('/api/backup', {}, CA)).status, 200);
  // estado inyectado en la página y API de usuarios con permisos resueltos en el servidor
  const html = await (await f('/', {}, CV)).text(); assert(html.includes('"auth":{"habilitado":true') && html.includes('"rol":"consulta"'));
  assert.deepStrictEqual(await (await post('/api/auth/listar', { args: [] }, CL)).json(), [], 'empleado no ve usuarios');
  assert.strictEqual((await (await post('/api/auth/listar', { args: [] }, CA)).json()).length, 3);
  assert.strictEqual((await (await post('/api/auth/crear', { args: [{ user: 'zzz', rol: 'admin', clave: 'Clave1234' }] }, CL)).json()).ok, false);
  assert((await (await post('/api/auth/auditoria', { args: [{}] }, CA)).json()).some(x => x.accion === 'respaldo.descargar'));
  assert.strictEqual((await post('/api/auth/login', { args: ['ana', 'Clave1234'] }, CA)).status, 404, 'login no se expone como operación');
  // cerrar sesión invalida el token
  await f('/api/logout', {}, CL); assert.strictEqual((await f('/api/rev', {}, CL)).status, 401);
  g.stop(); console.log('servidor-usuarios OK');
})().catch(e => { console.error(e); process.exit(1); });
// ---- HTTPS (certificado propio) ----
(async () => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-tls-'));
  const store = crearStore({ dataFile: path.join(base, 'd.json'), configFile: path.join(base, 'c.json'), docsDir: base, home: base }); store.load();
  const g = gestor({ store, certDir: path.join(base, 'cert'), indexPath: path.join(__dirname, '..', 'index.html'), defaults: { puertoRemoto: 0 } });
  const i = await g.setConfig({ enabled: true, https: true });
  assert(i.running && i.https && i.urls.every(u => u.startsWith('https://')), 'solo https');
  const U = 'https://127.0.0.1:' + i.port;
  let r = await fetch(U + '/login'); assert.strictEqual(r.status, 200); assert(r.headers.get('strict-transport-security'));
  r = await fetch(U + '/api/login', { method: 'POST', body: JSON.stringify({ pin: i.pin }) }); assert.strictEqual(r.status, 200);
  assert(/; Secure/.test(r.headers.get('set-cookie')), 'cookie Secure');
  assert(fs.existsSync(path.join(base, 'cert', 'https-cert.pem')));
  const i2 = await g.setConfig({ https: false }); assert(!i2.https && i2.urls.every(u => u.startsWith('http://')));
  g.stop(); console.log('https OK');
})().catch(e => { console.error(e); process.exit(1); });
