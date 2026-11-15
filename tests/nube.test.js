// Servidor en la nube (nube/servidor.js): alta de comercios, ingesta, panel de solo lectura,
// aislamiento entre comercios, frescura, revocación y reinicio.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { crear } = require('../nube/servidor.js');

const ADMIN = 'token-admin-de-prueba-0123456789abcdef', DOMINIO = 'nube.test';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-nube-'));
let reloj = Date.parse('2026-03-10T15:00:00.000Z');
let s, base;
console.log = (log => (...a) => { if (!String(a[0]).startsWith('[admin]')) log(...a); })(console.log);   // sin ruido del servidor

async function levantar() {
  s = crear({ dataDir: dir, dominioBase: DOMINIO, adminToken: ADMIN, ahora: () => reloj });
  base = 'http://127.0.0.1:' + await s.listen(0, '127.0.0.1');
}
// Pedido con fetch. o = { sub, token, cookie, body (objeto o texto), headers }
async function pedir(metodo, ruta, o = {}) {
  const headers = { ...o.headers };
  if (o.sub) headers['X-Comercio'] = o.sub;
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  if (o.cookie) headers.Cookie = o.cookie;
  let body;
  if (o.body !== undefined) { body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body); headers['Content-Type'] = 'application/json'; }
  const r = await fetch(base + ruta, { method: metodo, headers, body });
  const texto = await r.text();
  let j = null; try { j = JSON.parse(texto); } catch {}
  return { estado: r.status, j, texto, h: r.headers };
}
// Pedido con un Host real (fetch no deja cambiarlo).
function pedirHost(host, ruta, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    http.get({ host: u.hostname, port: u.port, path: ruta, agent: false, headers: { Host: host, ...headers } }, r => {
      let t = ''; r.on('data', d => t += d); r.on('end', () => resolve({ estado: r.statusCode, texto: t, h: r.headers }));
    }).on('error', reject);
  });
}
const admin = (metodo, ruta, body) => pedir(metodo, ruta, { token: ADMIN, body });
const cookieDe = r => (r.h.get('set-cookie') || '').split(';')[0];
const fotoEnDisco = id => { const t = fs.readFileSync(path.join(dir, 'foto', id + '.json'), 'utf8'); return t.startsWith('gz:') ? require('zlib').gunzipSync(Buffer.from(t.slice(3), 'base64')).toString('utf8') : t; };   // se guarda comprimida
const foto = (nombre, total) => ({ v: 1, generado: new Date(reloj).toISOString(), negocio: { nombre, moneda: 'ARS', loc: 'es-AR' },
  ventas: [{ id: 'v1', fecha: new Date(reloj).toISOString(), total, pago: 'Efectivo', cliente: null, usuario: 'ana', anulada: false, items: [{ n: 'Yerba', q: 1, p: total, t: total }] }],
  stock: [{ n: 'Yerba', cod: '779', cat: 'Almacén', precio: total, disp: 3, min: 5, vence: '', estado: 'bajo' }], cajas: [], clientes: [], bajas: [], vencimientos: [] });

(async () => {
  await levantar();
  assert.deepStrictEqual((await pedir('GET', '/salud')).j, { ok: true });

  // --- Admin: autenticación ---
  assert.strictEqual((await pedir('GET', '/admin/comercios')).estado, 401, 'admin sin token');
  assert.strictEqual((await pedir('GET', '/admin/comercios', { token: 'otro-token' })).estado, 401, 'admin con token malo');
  assert.strictEqual((await pedir('POST', '/admin/comercios', { body: { nombre: 'X', sub: 'equis' } })).estado, 401);

  // --- Alta de dos comercios ---
  const a = await admin('POST', '/admin/comercios', { nombre: 'Almacén A', sub: 'almacen-a' });
  const b = await admin('POST', '/admin/comercios', { nombre: 'Kiosco B', sub: 'kiosco-b' });
  assert.strictEqual(a.estado, 201); assert.strictEqual(b.estado, 201);
  assert.strictEqual(a.j.id, 'store_001'); assert.strictEqual(b.j.id, 'store_002');
  assert.match(a.j.token, /^spn_[0-9a-f]{48}$/); assert.match(a.j.clave, /^[a-z0-9]{10}$/);
  assert.strictEqual(a.j.url, 'https://almacen-a.' + DOMINIO);
  assert.notStrictEqual(a.j.token, b.j.token); assert.notStrictEqual(a.j.clave, b.j.clave);
  const A = a.j, B = b.j;

  // --- Subdominios inválidos, reservados y repetidos ---
  for (const sub of ['ab', 'Con Espacio', '-raya', 'raya-', 'ñandú', 'a'.repeat(40), '', 'a.b'])
    assert.strictEqual((await admin('POST', '/admin/comercios', { nombre: 'X', sub })).estado, 400, 'sub inválido: ' + sub);
  for (const sub of ['www', 'admin', 'api', 'app', 'panel', 'mail'])
    assert.strictEqual((await admin('POST', '/admin/comercios', { nombre: 'X', sub })).estado, 400, 'sub reservado: ' + sub);
  assert.strictEqual((await admin('POST', '/admin/comercios', { nombre: 'Otro', sub: 'almacen-a' })).estado, 409, 'sub repetido');
  assert.strictEqual((await admin('POST', '/admin/comercios', { nombre: '', sub: 'sin-nombre' })).estado, 400);
  assert.strictEqual((await pedir('POST', '/admin/comercios', { token: ADMIN, body: 'no es json' })).estado, 400);

  // --- Listado sin secretos; nada sensible en disco en claro ---
  const l = await admin('GET', '/admin/comercios');
  assert.strictEqual(l.j.length, 2);
  assert.deepStrictEqual(Object.keys(l.j[0]).sort(), ['activo', 'alta', 'id', 'nombre', 'sub', 'ultimaSync']);
  assert(!/hash|salt|spn_/i.test(l.texto));
  const crudo = fs.readFileSync(path.join(dir, 'comercios.json'), 'utf8');
  assert(!crudo.includes(A.token) && !crudo.includes(A.clave) && !crudo.includes(ADMIN), 'comercios.json no guarda secretos en claro');

  // --- Admin nunca por el subdominio de un comercio ---
  assert.strictEqual((await pedir('GET', '/admin/comercios', { token: ADMIN, sub: 'almacen-a' })).estado, 404);
  assert.strictEqual((await pedir('POST', '/admin/comercios', { token: ADMIN, sub: 'almacen-a', body: { nombre: 'X', sub: 'colado' } })).estado, 404);
  assert.strictEqual((await pedirHost('almacen-a.' + DOMINIO, '/admin/comercios', { Authorization: 'Bearer ' + ADMIN })).estado, 404);
  assert.strictEqual((await pedirHost('almacen-a.' + DOMINIO, '/admin/comercios')).estado, 404);
  assert.strictEqual((await pedirHost(DOMINIO, '/admin/comercios', { Authorization: 'Bearer ' + ADMIN })).estado, 200, 'admin en el host base');
  assert.strictEqual((await admin('GET', '/admin/comercios')).j.length, 2);

  // --- Ingesta ---
  const f1 = foto('Almacén A', 1500);
  let r = await pedir('POST', '/ingesta', { token: A.token, body: { seq: 1, foto: f1 } });
  assert.strictEqual(r.estado, 200); assert.deepStrictEqual(r.j, { ok: true, seq: 1 });
  assert.deepStrictEqual(JSON.parse(fotoEnDisco(A.id)), f1);
  const mtime = fs.statSync(path.join(dir, 'foto', A.id + '.json')).mtimeMs;
  r = await pedir('POST', '/ingesta', { token: A.token, body: { seq: 1, foto: foto('Cambiada', 9) } });
  assert.deepStrictEqual(r.j, { ok: true, seq: 1, repetido: true }, 'ingesta repetida es idempotente');
  r = await pedir('POST', '/ingesta', { token: A.token, body: { seq: 0, foto: foto('Cambiada', 9) } });
  assert.strictEqual(r.j.repetido, true);
  assert.deepStrictEqual(JSON.parse(fotoEnDisco(A.id)), f1, 'la repetida no reescribe');
  assert.strictEqual(fs.statSync(path.join(dir, 'foto', A.id + '.json')).mtimeMs, mtime);
  assert.strictEqual((await pedir('POST', '/ingesta', { token: 'spn_' + '0'.repeat(48), body: { seq: 5, foto: f1 } })).estado, 401, 'token inválido');
  assert.strictEqual((await pedir('POST', '/ingesta', { body: { seq: 5, foto: f1 } })).estado, 401, 'sin token');
  assert.strictEqual((await pedir('POST', '/ingesta', { token: ADMIN, body: { seq: 5, foto: f1 } })).estado, 401, 'el token de admin no ingesta');
  assert.strictEqual((await pedir('POST', '/ingesta', { token: A.token, body: '{esto no es json' })).estado, 400, 'cuerpo no JSON');
  assert.strictEqual((await pedir('POST', '/ingesta', { token: A.token, body: { seq: 5, foto: 'texto' } })).estado, 400);
  assert.strictEqual((await pedir('POST', '/ingesta', { token: A.token, body: { seq: 5, foto: [] } })).estado, 400);
  assert.strictEqual((await pedir('POST', '/ingesta', { token: A.token, body: { seq: 5, foto: { ventas: 'x' } } })).estado, 400);
  assert.strictEqual((await pedir('POST', '/ingesta', { token: A.token, body: { seq: 'dos', foto: f1 } })).estado, 400);
  assert.strictEqual((await pedir('GET', '/ingesta', { token: A.token })).estado, 405);
  r = await pedir('POST', '/ingesta', { token: A.token, body: { seq: 6, foto: { v: 1, relleno: 'x'.repeat(8 * 1024 * 1024) } } });
  assert.strictEqual(r.estado, 413, 'cuerpo de más de 8 MB');
  assert.deepStrictEqual(JSON.parse(fotoEnDisco(A.id)), f1);

  // --- Aislamiento de la ingesta: el token de A nunca escribe en B, diga lo que diga el Host ---
  const f2 = foto('Almacén A', 2500);
  r = await pedir('POST', '/ingesta', { token: A.token, sub: 'kiosco-b', body: { seq: 2, foto: f2 } });
  assert.strictEqual(r.estado, 200);
  assert.deepStrictEqual(JSON.parse(fotoEnDisco(A.id)), f2);
  assert(!fs.existsSync(path.join(dir, 'foto', B.id + '.json')), 'B no recibió nada');
  const fB = foto('Kiosco B', 777);
  assert.strictEqual((await pedir('POST', '/ingesta', { token: B.token, body: { seq: 1, foto: fB } })).estado, 200);
  assert.deepStrictEqual(JSON.parse(fotoEnDisco(A.id)), f2);

  // --- Página del panel y cabeceras de seguridad ---
  r = await pedir('GET', '/', { sub: 'almacen-a' });
  assert.strictEqual(r.estado, 200);
  assert.match(r.h.get('content-type'), /text\/html/);
  const csp = r.h.get('content-security-policy');
  for (const d of ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "connect-src 'self'", "frame-ancestors 'none'"]) assert(csp.includes(d), 'CSP sin ' + d);
  assert.strictEqual(r.h.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(r.h.get('referrer-policy'), 'no-referrer');
  assert(!r.texto.includes(ADMIN), 'el panel no contiene el ADMIN_TOKEN');
  assert(!r.texto.includes(A.token) && !r.texto.includes(A.clave));
  assert(r.texto.includes('Solo consulta') && r.texto.includes('<b>Stock</b>Project'));
  assert(!/(src|href)\s*=\s*["']?https?:/i.test(r.texto), 'el panel no carga nada externo');
  assert(!/innerHTML|insertAdjacentHTML|document\.write/.test(r.texto), 'el panel no arma HTML con datos');
  r = await pedir('GET', '/', { sub: 'no-existe' });
  assert.strictEqual(r.estado, 404); assert(r.texto.includes('Comercio no encontrado'));
  assert(r.h.get('content-security-policy'));
  assert.strictEqual((await pedirHost('almacen-a.' + DOMINIO, '/')).estado, 200, 'panel por Host');
  assert.strictEqual((await pedirHost('fantasma.' + DOMINIO, '/')).estado, 404);
  assert.strictEqual((await pedirHost('admin.' + DOMINIO, '/')).estado, 404);

  // --- Login: clave mala y bloqueo ---
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'almacen-a' })).estado, 401, 'sin sesión');
  for (let i = 1; i <= 5; i++) assert.strictEqual((await pedir('POST', '/api/login', { sub: 'almacen-a', body: { clave: 'mala' + i } })).estado, 401, 'clave mala ' + i);
  assert.strictEqual((await pedir('POST', '/api/login', { sub: 'almacen-a', body: { clave: A.clave } })).estado, 429, 'bloqueo al 6.º intento');
  // El bloqueo es por comercio: B sigue pudiendo entrar.
  const lb = await pedir('POST', '/api/login', { sub: 'kiosco-b', body: { clave: B.clave } });
  assert.strictEqual(lb.estado, 200);
  const cookieB = cookieDe(lb);
  assert.strictEqual((await pedir('POST', '/api/login', { sub: 'kiosco-b', body: { clave: A.clave } })).estado, 401, 'la clave de A no abre B');
  reloj += 10 * 60 * 1000 + 1000;   // pasa la ventana del bloqueo

  // --- Login ok y cookie ---
  const la = await pedir('POST', '/api/login', { sub: 'almacen-a', body: { clave: A.clave } });
  assert.strictEqual(la.estado, 200);
  const sc = la.h.get('set-cookie');
  assert.match(sc, /^sp_nube=[0-9a-f]{64};/);
  assert(/HttpOnly/.test(sc) && /SameSite=Strict/.test(sc) && /Path=\//.test(sc) && /Max-Age=2592000/.test(sc));
  assert(!/Domain=/i.test(sc) && !/Secure/.test(sc));
  const ls = await pedir('POST', '/api/login', { sub: 'almacen-a', body: { clave: A.clave }, headers: { 'X-Forwarded-Proto': 'https' } });
  assert(/; Secure/.test(ls.h.get('set-cookie')), 'Secure detrás de https');
  const cookieA = cookieDe(la);
  assert(!fs.readFileSync(path.join(dir, 'sesiones.json'), 'utf8').includes(cookieA.split('=')[1]), 'sesiones.json no guarda el token de sesión en claro');

  // --- /api/datos devuelve la foto ---
  const f3 = foto('Almacén A', 3500);
  assert.strictEqual((await pedir('POST', '/ingesta', { token: A.token, body: { seq: 3, foto: f3 } })).estado, 200);
  let d = await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: cookieA });
  assert.strictEqual(d.estado, 200);
  assert.deepStrictEqual(d.j.foto, f3);
  assert.deepStrictEqual(d.j.negocio, { nombre: 'Almacén A' });
  assert.strictEqual(d.j.ultimaSync, new Date(reloj).toISOString());
  assert.strictEqual(d.j.ahora, new Date(reloj).toISOString());
  assert.strictEqual(d.j.desactualizado, false);
  assert(!/hash|salt|spn_/i.test(d.texto));

  // --- Aislamiento del panel ---
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'kiosco-b', cookie: cookieA })).estado, 401, 'cookie de A contra B');
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: cookieB })).estado, 401, 'cookie de B contra A');
  assert.strictEqual((await pedir('GET', '/api/datos', { cookie: cookieA })).estado, 404, 'sin comercio');
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: 'sp_nube=' + 'f'.repeat(64) })).estado, 401);
  assert.strictEqual((await pedirHost('kiosco-b.' + DOMINIO, '/api/datos', { Cookie: cookieA })).estado, 401);
  assert.strictEqual((await pedirHost('kiosco-b.' + DOMINIO, '/api/datos', { Cookie: cookieA, 'X-Comercio': 'almacen-a' })).estado, 401, 'con Host del dominio, X-Comercio no cuenta');
  assert.strictEqual((await pedirHost('almacen-a.' + DOMINIO, '/api/datos', { Cookie: cookieA })).estado, 200);
  d = await pedir('GET', '/api/datos', { sub: 'kiosco-b', cookie: cookieB });
  assert.deepStrictEqual(d.j.foto, fB); assert.strictEqual(d.j.negocio.nombre, 'Kiosco B');

  // --- Solo lectura ---
  const antes = fotoEnDisco(A.id), comAntes = fs.readFileSync(path.join(dir, 'comercios.json'), 'utf8');
  for (const m of ['PUT', 'POST', 'DELETE', 'PATCH'])
    assert.strictEqual((await pedir(m, '/api/datos', { sub: 'almacen-a', cookie: cookieA, body: { foto: { ventas: [] } } })).estado, 405, m + ' /api/datos');
  for (const [m, ruta] of [['POST', '/api/ventas'], ['PUT', '/api/foto'], ['DELETE', '/api/datos/v1'], ['POST', '/api/stock/1'], ['GET', '/api/comercios'], ['POST', '/api'], ['GET', '/api/'], ['POST', '/'], ['DELETE', '/'], ['PUT', '/foto.json'], ['GET', '/comercios.json'], ['GET', '/store_001/foto.json']]) {
    const x = await pedir(m, ruta, { sub: 'almacen-a', cookie: cookieA, body: m === 'GET' ? undefined : { x: 1 } });
    assert([404, 405].includes(x.estado), `${m} ${ruta} → ${x.estado}`);
  }
  assert.strictEqual((await pedir('GET', '/api/login', { sub: 'almacen-a' })).estado, 405);
  // La cookie del panel no sirve para ingestar ni para administrar.
  assert.strictEqual((await pedir('POST', '/ingesta', { cookie: cookieA, body: { seq: 99, foto: { ventas: [] } } })).estado, 401);
  assert.strictEqual((await pedir('GET', '/admin/comercios', { cookie: cookieA })).estado, 401);
  assert.strictEqual(fotoEnDisco(A.id), antes, 'la foto no cambió');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'comercios.json'), 'utf8'), comAntes);

  // --- Frescura ---
  reloj += 119 * 1000;
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: cookieA })).j.desactualizado, false);
  reloj += 2 * 1000;   // 121 s desde la última sincronización
  d = await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: cookieA });
  assert.strictEqual(d.j.desactualizado, true);
  assert.deepStrictEqual(d.j.foto, f3, 'desactualizado igual muestra los últimos datos');
  // Un comercio que nunca sincronizó.
  const c = (await admin('POST', '/admin/comercios', { nombre: 'Nuevo C', sub: 'nuevo-c' })).j;
  const cookieC = cookieDe(await pedir('POST', '/api/login', { sub: 'nuevo-c', body: { clave: c.clave } }));
  d = await pedir('GET', '/api/datos', { sub: 'nuevo-c', cookie: cookieC });
  assert.strictEqual(d.j.foto, null); assert.strictEqual(d.j.ultimaSync, null); assert.strictEqual(d.j.desactualizado, true);

  // --- Verificación para TLS a pedido ---
  const tls = dom => pedir('GET', '/interno/tls-permitido?domain=' + encodeURIComponent(dom)).then(x => x.estado);
  assert.strictEqual(await tls(DOMINIO), 200);
  assert.strictEqual(await tls('almacen-a.' + DOMINIO), 200);
  assert.strictEqual(await tls('ALMACEN-A.' + DOMINIO), 200);
  assert.strictEqual(await tls('no-existe.' + DOMINIO), 404);
  assert.strictEqual(await tls('x.almacen-a.' + DOMINIO), 404);
  assert.strictEqual(await tls('otro-dominio.com'), 404);
  assert.strictEqual(await tls('mal' + DOMINIO), 404);
  assert.strictEqual(await tls(''), 404);

  // --- Reinicio: se conservan comercios, foto y sesiones ---
  await s.close();
  await levantar();
  assert.strictEqual((await admin('GET', '/admin/comercios')).j.length, 3);
  d = await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: cookieA });
  assert.strictEqual(d.estado, 200, 'la sesión sobrevive al reinicio');
  assert.deepStrictEqual(d.j.foto, f3);
  assert.deepStrictEqual((await pedir('POST', '/ingesta', { token: A.token, body: { seq: 3, foto: f1 } })).j, { ok: true, seq: 3, repetido: true }, 'el seq sobrevive al reinicio');
  const d4 = (await admin('POST', '/admin/comercios', { nombre: 'Cuarto', sub: 'cuarto-d' })).j;
  assert.strictEqual(d4.id, 'store_004', 'los ids siguen correlativos');

  // --- Revocación: token de instalación ---
  r = await admin('POST', `/admin/comercios/${A.id}/token`);
  assert.strictEqual(r.estado, 200); assert.match(r.j.token, /^spn_[0-9a-f]{48}$/); assert.notStrictEqual(r.j.token, A.token);
  const tokenA2 = r.j.token;
  assert.strictEqual((await pedir('POST', '/ingesta', { token: A.token, body: { seq: 50, foto: f1 } })).estado, 401, 'el token viejo ya no sirve');
  assert.deepStrictEqual(JSON.parse(fotoEnDisco(A.id)), f3);
  const f4 = foto('Almacén A', 4500);
  assert.strictEqual((await pedir('POST', '/ingesta', { token: tokenA2, body: { seq: 51, foto: f4 } })).estado, 200);
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: cookieA })).j.foto.ventas[0].total, 4500);
  assert.strictEqual((await admin('POST', '/admin/comercios/store_999/token')).estado, 404);
  assert.strictEqual((await pedir('POST', `/admin/comercios/${A.id}/token`)).estado, 401);

  // --- Revocación: clave del panel ---
  r = await admin('POST', `/admin/comercios/${A.id}/clave`);
  assert.strictEqual(r.estado, 200); assert.match(r.j.clave, /^[a-z0-9]{10}$/);
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: cookieA })).estado, 401, 'la sesión vieja se cerró');
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'kiosco-b', cookie: cookieB })).estado, 200, 'las sesiones de B siguen');
  assert.strictEqual((await pedir('POST', '/api/login', { sub: 'almacen-a', body: { clave: A.clave } })).estado, 401, 'la clave vieja no entra');
  const ln = await pedir('POST', '/api/login', { sub: 'almacen-a', body: { clave: r.j.clave } });
  assert.strictEqual(ln.estado, 200);
  const cookieA2 = cookieDe(ln);
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: cookieA2 })).estado, 200);

  // --- Salir ---
  assert.strictEqual((await pedir('POST', '/api/logout', { sub: 'kiosco-b', cookie: cookieB })).estado, 200);
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'kiosco-b', cookie: cookieB })).estado, 401);

  // --- Desactivar un comercio ---
  assert.strictEqual((await admin('POST', `/admin/comercios/${B.id}/estado`, { activo: 'no' })).estado, 400);
  const cookieB2 = cookieDe(await pedir('POST', '/api/login', { sub: 'kiosco-b', body: { clave: B.clave } }));
  r = await admin('POST', `/admin/comercios/${B.id}/estado`, { activo: false });
  assert.strictEqual(r.estado, 200); assert.strictEqual(r.j.activo, false);
  assert.strictEqual((await pedir('POST', '/ingesta', { token: B.token, body: { seq: 9, foto: foto('Kiosco B', 1) } })).estado, 401, 'inactivo no ingesta');
  assert.strictEqual((await pedir('POST', '/api/login', { sub: 'kiosco-b', body: { clave: B.clave } })).estado, 401, 'inactivo no ingresa');
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'kiosco-b', cookie: cookieB2 })).estado, 401, 'inactivo: la sesión abierta se cierra');
  assert.strictEqual(await tls('kiosco-b.' + DOMINIO), 404);
  assert.deepStrictEqual(JSON.parse(fotoEnDisco(B.id)), fB);
  assert.strictEqual((await admin('POST', `/admin/comercios/${B.id}/estado`, { activo: true })).j.activo, true);
  assert.strictEqual((await pedir('POST', '/api/login', { sub: 'kiosco-b', body: { clave: B.clave } })).estado, 200);

  // --- La sesión vence a los 30 días ---
  reloj += 30 * 24 * 3600 * 1000 + 1000;
  assert.strictEqual((await pedir('GET', '/api/datos', { sub: 'almacen-a', cookie: cookieA2 })).estado, 401);

  // --- Los errores no muestran trazas ni rutas internas ---
  for (const x of [await pedir('POST', '/ingesta', { token: tokenA2, body: '{' }), await pedir('GET', '/no/existe'), await pedir('GET', '/api/datos', { sub: 'almacen-a' })])
    assert(!x.texto.includes(dir) && !/servidor\.js|\bat \w+ \(/.test(x.texto));

  // --- Límite de intentos fallidos de ingesta por IP ---
  let ultimo;
  for (let i = 0; i < 21; i++) ultimo = (await pedir('POST', '/ingesta', { token: 'spn_malo' + i, body: { seq: 1, foto: {} } })).estado;
  assert.strictEqual(ultimo, 429);
  assert.strictEqual((await pedir('POST', '/ingesta', { token: tokenA2, body: { seq: 60, foto: f4 } })).estado, 429);
  reloj += 61 * 1000;
  assert.strictEqual((await pedir('POST', '/ingesta', { token: tokenA2, body: { seq: 60, foto: f4 } })).estado, 200);

  await s.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('NUBE_OK'); process.exit(0);
})().catch(async e => {
  console.error(e);
  try { await s.close(); } catch {}
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
