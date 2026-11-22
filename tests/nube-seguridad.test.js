// Arreglos de la auditoría del 16/11/2026 en el servidor del panel (nube/): límites atómicos (W1), una clave por
// comercio y por sesión con mudanza desde el formato viejo (W2), headers y scripts propios en la landing (W3),
// topes de altas, de foto y de envíos (W4), JSON y Origin obligatorios (W5) y archivos del servidor no públicos (W7).
const assert = require('assert'), crypto = require('crypto'), fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const { crear, LIMITE_INGESTA } = require('../nube/servidor'), { redis } = require('../nube/almacen');
const NUBE = path.join(__dirname, '..', 'nube');
console.log = (log => (...a) => { if (!/^\[(admin|registro|datos|clave)\]/.test(String(a[0]))) log(...a); })(console.log);

const sha256 = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const scrypt = (clave, salt) => crypto.scryptSync(String(clave), Buffer.from(salt, 'hex'), 32).toString('hex');
const gz = t => 'gz:' + zlib.gzipSync(Buffer.from(t, 'utf8')).toString('base64');

(async () => {
  let reloj = Date.parse('2026-11-16T12:00:00.000Z');
  const SIM = require('./redis-simulado')({ reloj: () => reloj }), R = SIM.R, ADMIN = 'z'.repeat(40);

  // ---- Datos de producción en el formato viejo (5.6.x): lista "comercios" y objeto "sesiones" enteros ----
  const TOK_PRUEBA = 'spn_' + 'ab'.repeat(24), CLAVE_PRUEBA = 'k7mpq2rstu', SAL1 = 'aa'.repeat(16);
  const TOK_PROPIA = 'spn_' + 'cd'.repeat(24), CLAVE_PROPIA = 'MiNegocio2026', SAL2 = 'bb'.repeat(16);
  const SES_VIVA = 'ee'.repeat(32), SES_VENCIDA = 'ff'.repeat(32);
  const viejos = [
    // comercio muy viejo: sin claveTipo (clave generada, sin distinguir mayúsculas)
    { id: 'store_001', nombre: 'Prueba', sub: 'prueba', activo: true, alta: '2026-05-01T10:00:00.000Z', origen: 'admin', tokenHash: sha256(TOK_PRUEBA), ultimaSync: null, seq: 0, claveSalt: SAL1, claveHash: scrypt(CLAVE_PRUEBA, SAL1) },
    { id: 'store_002', nombre: 'Kiosco Propio', sub: 'kiosco-propio', activo: true, alta: '2026-09-01T10:00:00.000Z', origen: 'registro', tokenHash: sha256(TOK_PROPIA), ultimaSync: null, seq: 0, claveSalt: SAL2, claveTipo: 'propia', claveHash: scrypt(CLAVE_PROPIA, SAL2) },
  ];
  const sesionesViejas = { [sha256(SES_VIVA)]: { id: 'store_001', vence: reloj + 5 * 864e5 }, [sha256(SES_VENCIDA)]: { id: 'store_001', vence: reloj - 1000 } };
  const fotoVieja = { v: 1, negocio: { nombre: 'Prueba' }, ventas: [{ id: 1, total: 4321 }] };
  R.set('sp:comercios', JSON.stringify(viejos, null, 1)); R.set('sp:sesiones', JSON.stringify(sesionesViejas));
  R.set('sp:intentos', JSON.stringify({ 'login|1.1.1.1|store_001': [reloj] }));
  R.set('sp:estado:store_001', JSON.stringify({ seq: 1763290000000, ultimaSync: new Date(reloj - 60000).toISOString() }));
  R.set('sp:foto:store_001', gz(JSON.stringify(fotoVieja)));
  const blobAntes = R.get('sp:comercios');

  // Dos copias sin memoria compartida (como dos funciones de Vercel), detrás de un proxy que pone X-Forwarded-For.
  const copia = () => crear({ almacen: redis({ url: 'https://redis.prueba', token: 'tok', pedir: SIM.pedir }), recargar: true, adminToken: ADMIN, ahora: () => reloj, confiarProxy: true, frescuraMs: 420000 });
  const A = copia(), B = copia(); let turno = 0;
  const srv = http.createServer((q, s) => (turno++ % 2 ? A : B).manejar(q, s)); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const J = async (u, { ip = '9.9.9.9', headers = {}, body, method } = {}) => {
    const h = { 'X-Forwarded-For': ip, ...headers };
    if (body !== undefined && !('Content-Type' in h)) h['Content-Type'] = 'application/json';
    const r = await fetch(base + u, { method: method || (body !== undefined ? 'POST' : 'GET'), headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
    return { s: r.status, j, t, c: (r.headers.get('set-cookie') || '').split(';')[0], h: r.headers };
  };
  const login = (sub, clave, o = {}) => J('/c/' + sub + '/api/login', { ...o, body: { clave } });
  const enviar = (tok, seq, foto, o = {}) => J('/ingesta', { ...o, headers: { Authorization: 'Bearer ' + tok, ...(o.headers || {}) }, body: { seq, foto } });
  const adm = (u, b) => J(u, { headers: { Authorization: 'Bearer ' + ADMIN }, body: b === undefined ? {} : b });

  // ===== W2: los datos viejos siguen funcionando =====
  let r = await login('prueba', CLAVE_PRUEBA.toUpperCase()); assert.strictEqual(r.s, 200, 'clave vieja (generada, sin claveTipo) entra');
  assert.strictEqual(R.get('sp:version-datos'), '2', 'mudanza hecha'); assert.strictEqual(R.get('sp:comercios'), blobAntes, 'la lista vieja queda intacta (para volver atrás)');
  assert.strictEqual((await login('kiosco-propio', CLAVE_PROPIA.toLowerCase())).s, 401, 'la clave propia distingue mayúsculas');
  assert.strictEqual((await login('kiosco-propio', CLAVE_PROPIA)).s, 200);
  let d = await J('/c/prueba/api/datos', { headers: { Cookie: 'sp_nube=' + SES_VIVA } });
  assert.strictEqual(d.s, 200, 'la sesión abierta antes de la mudanza sigue valiendo'); assert.strictEqual(d.j.foto.ventas[0].total, 4321, 'la foto vieja se ve');
  assert.strictEqual((await J('/c/prueba/api/datos', { headers: { Cookie: 'sp_nube=' + SES_VENCIDA } })).s, 401, 'la sesión vencida no revive');
  assert(SIM.vence.get('sp:sesion:' + sha256(SES_VIVA)) > reloj, 'la sesión mudada vence sola en Redis');
  assert.strictEqual((await J('/c/prueba')).s, 200, 'el panel del comercio viejo carga');
  assert.deepStrictEqual((await enviar(TOK_PRUEBA, 1763290000000, fotoVieja)).j, { ok: true, seq: 1763290000000, repetido: true }, 'el seq viejo se respeta');
  assert.strictEqual((await enviar(TOK_PRUEBA, 1763290000001, { v: 1, ventas: [{ id: 2, total: 99 }] })).s, 200, 'el token viejo ingesta');
  assert.strictEqual((await J('/c/prueba/api/datos', { headers: { Cookie: 'sp_nube=' + SES_VIVA } })).j.foto.ventas[0].total, 99);
  assert.strictEqual((await J('/clave-instalacion', { headers: { Authorization: 'Bearer ' + TOK_PROPIA }, body: { nueva: 'OtraClave2027' } })).s, 200, 'clave-instalacion con token viejo');
  assert.strictEqual((await login('kiosco-propio', 'OtraClave2027')).s, 200);
  const lista = (await J('/admin/comercios', { headers: { Authorization: 'Bearer ' + ADMIN } })).j;
  assert.deepStrictEqual(lista.map(c => c.sub), ['prueba', 'kiosco-propio'], 'la administración ve los comercios viejos');
  assert.strictEqual((await adm('/admin/comercios', { nombre: 'Otra', sub: 'prueba' })).s, 409, 'la dirección vieja sigue ocupada');
  // una copia que todavía no mudó y otra que sí, a la vez: nada se pisa (crearSiNo)
  const C = copia(); R.delete('sp:version-datos');
  const s3 = http.createServer((q, s) => C.manejar(q, s)); await new Promise(x => s3.listen(0, '127.0.0.1', x));
  assert.strictEqual((await fetch('http://127.0.0.1:' + s3.address().port + '/c/kiosco-propio/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: 'OtraClave2027' }) })).status, 200, 'mudar de nuevo no vuelve a la clave vieja');
  s3.close(); s3.closeAllConnections();

  // ===== W2: altas simultáneas = ids y direcciones distintas; un alta no revierte un cambio de clave =====
  const altas = await Promise.all(Array.from({ length: 6 }, (_, i) => J('/registro', { ip: '10.0.' + i + '.1', body: { nombre: 'Kiosco Simultáneo' } })));
  assert(altas.every(x => x.s === 201), 'todas las altas salen'); const ids = altas.map(x => x.j.id), subs = altas.map(x => x.j.sub);
  assert.strictEqual(new Set(ids).size, 6, 'ids distintos: ' + ids); assert.strictEqual(new Set(subs).size, 6, 'direcciones distintas');
  assert(!ids.includes('store_001') && !ids.includes('store_002'), 'no repite ids viejos');
  const [cambio] = await Promise.all([J('/clave-instalacion', { headers: { Authorization: 'Bearer ' + altas[0].j.token }, body: { nueva: 'Cambiada2026x' } }), J('/registro', { ip: '10.9.9.9', body: { nombre: 'Otro' } })]);
  assert.strictEqual(cambio.s, 200); assert.strictEqual((await login(altas[0].j.sub, 'Cambiada2026x')).s, 200, 'el cambio de clave no se revirtió');

  // ===== W1: el tope de intentos no se esquiva en paralelo =====
  const malos = await Promise.all(Array.from({ length: 12 }, (_, i) => login('prueba', 'mala' + i, { ip: '7.7.7.7' })));
  assert.strictEqual(malos.filter(x => x.s === 401).length, 5, 'solo 5 intentos se prueban'); assert.strictEqual(malos.filter(x => x.s === 429).length, 7);
  assert.strictEqual((await login('prueba', CLAVE_PRUEBA, { ip: '7.7.7.7' })).s, 429, 'bloqueado aunque ahora acierte');
  // barrer muchas direcciones no borra los bloqueos (antes, a las 20000 entradas se borraba todo)
  for (let i = 0; i < 40; i++) await J('/ingesta', { ip: '8.8.' + i + '.1', headers: { Authorization: 'Bearer spn_x' + i }, body: { seq: 1, foto: {} } });
  assert.strictEqual((await login('prueba', CLAVE_PRUEBA, { ip: '7.7.7.7' })).s, 429);
  // tope por comercio desde cualquier conexión
  let ultimo; for (let i = 0; i < 31; i++) ultimo = await login('kiosco-propio', 'mala' + i, { ip: '6.6.' + i + '.1' });
  assert.strictEqual(ultimo.s, 429, 'muchos intentos desde muchas conexiones también frenan');
  assert.strictEqual((await login('kiosco-propio', 'OtraClave2027', { ip: '5.5.5.5' })).s, 429);
  assert.strictEqual((await login('prueba', CLAVE_PRUEBA, { ip: '5.5.5.5' })).s, 200, 'el freno de un comercio no toca a otro');
  reloj += 10 * 60 * 1000;
  assert.strictEqual((await login('kiosco-propio', 'OtraClave2027', { ip: '5.5.5.5' })).s, 200, 'pasada la ventana se vuelve a entrar');
  assert([...SIM.vence.keys()].some(k => k.startsWith('sp:lim:')), 'los contadores vencen solos');

  // ===== W4: tope de altas por IP (por hora y por día) más chico que el total =====
  const ipReg = '4.4.4.4', reg = n => J('/registro', { ip: ipReg, body: { nombre: 'Alta ' + n } });
  for (let i = 0; i < 3; i++) assert.strictEqual((await reg(i)).s, 201);
  assert.strictEqual((await reg(3)).s, 429, '3 por hora');
  let hechos = 3; for (let h = 1; h <= 4; h++) { reloj += 3600 * 1000; for (let i = 0; i < 3; i++) { const x = await reg('h' + h + i); if (x.s === 201) hechos++; else assert.strictEqual(x.s, 429); } }
  assert.strictEqual(hechos, 10, 'como mucho 10 por día desde una conexión');
  assert.strictEqual((await J('/registro', { ip: '4.4.4.5', body: { nombre: 'Vecino' } })).s, 201, 'otra conexión sí puede');
  assert.strictEqual((await J('/registro', { ip: '4.4.4.6', body: { nombre: 'x' } })).s, 400, 'el alta inválida no gasta el cupo');
  // foto máxima más chica y tope de envíos por instalación
  assert(LIMITE_INGESTA <= 4 * 1024 * 1024 && LIMITE_INGESTA >= 3 * 1024 * 1024, 'foto máxima entre 3 y 4 MB');
  assert.strictEqual((await enviar(TOK_PRUEBA, Date.now() + 1, { v: 1, relleno: 'x'.repeat(LIMITE_INGESTA) })).s, 413);
  reloj += 3600 * 1000;
  const ing = []; for (let i = 0; i < 61; i++) ing.push((await enviar(TOK_PRUEBA, 1763300000000 + i, { v: 1, ventas: [] }, { ip: '3.3.3.3' })).s);
  assert(ing.slice(0, 60).every(x => x === 200), 'un envío cada 10 s durante 10 min pasa'); assert.strictEqual(ing[60], 429, 'más que eso se frena');

  // ===== W5: solo JSON; Origin de otra página no =====
  reloj += 3600 * 1000;
  assert.strictEqual((await J('/c/prueba/api/login', { ip: '2.2.2.2', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ clave: CLAVE_PRUEBA }) })).s, 415, 'login CSRF con text/plain');
  assert.strictEqual((await J('/c/prueba/api/login', { ip: '2.2.2.2', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'clave=' + CLAVE_PRUEBA })).s, 415);
  assert.strictEqual((await J('/registro', { ip: '2.2.2.3', headers: { 'Content-Type': 'text/plain' }, body: '{"nombre":"Colado"}' })).s, 415);
  assert.strictEqual((await login('prueba', CLAVE_PRUEBA, { ip: '2.2.2.4', headers: { Origin: 'https://malo.example' } })).s, 403, 'Origin ajeno');
  assert.strictEqual((await login('prueba', CLAVE_PRUEBA, { ip: '2.2.2.4', headers: { Origin: 'null' } })).s, 403);
  for (const o of ['https://stockprojectapp.vercel.app', 'https://stock-project-versiones.vercel.app', base]) assert.strictEqual((await login('prueba', CLAVE_PRUEBA, { ip: '2.2.2.5', headers: { Origin: o } })).s, 200, 'Origin propio: ' + o);
  assert.strictEqual((await J('/registro', { ip: '2.2.2.6', headers: { Origin: 'https://malo.example' }, body: { nombre: 'Colado' } })).s, 403);
  assert.strictEqual((await J('/registro', { ip: '2.2.2.7', body: { nombre: 'Desde la PC' } })).s, 201, 'la PC no manda Origin');

  // ===== cambio de clave cierra las otras sesiones (sin tocar la lista) =====
  const s1 = (await login('prueba', CLAVE_PRUEBA, { ip: '1.2.3.4' })).c, s2 = (await login('prueba', CLAVE_PRUEBA, { ip: '1.2.3.5' })).c;
  assert.strictEqual((await J('/c/prueba/api/clave', { ip: '1.2.3.4', headers: { Cookie: s1 }, body: { actual: CLAVE_PRUEBA, nueva: 'NuevaPrueba26' } })).s, 200);
  assert.strictEqual((await J('/c/prueba/api/datos', { headers: { Cookie: s1 } })).s, 200, 'la sesión que cambió sigue');
  assert.strictEqual((await J('/c/prueba/api/datos', { headers: { Cookie: s2 } })).s, 401, 'las demás se cierran');
  assert.strictEqual((await J('/c/prueba/api/datos', { headers: { Cookie: 'sp_nube=' + SES_VIVA } })).s, 401, 'también la mudada');
  assert.strictEqual((await adm('/admin/comercios/store_001/estado', { activo: false })).s, 200);
  assert.strictEqual((await J('/c/prueba/api/datos', { headers: { Cookie: s1 } })).s, 401, 'desactivar cierra sesiones');
  assert.strictEqual(R.get('sp:comercios'), blobAntes, 'nada escribe la lista vieja');
  assert(!JSON.stringify([...R.values()]).includes(TOK_PRUEBA) && !JSON.stringify([...R.values()]).includes('NuevaPrueba26'), 'sin secretos en claro');
  srv.close(); srv.closeAllConnections();

  // ===== W3 y W7: landing sin scripts externos ni en línea; headers y bloqueos en vercel.json =====
  const html = fs.readFileSync(path.join(NUBE, 'index.html'), 'utf8');
  assert(!/<script[^>]*src="https?:/i.test(html), 'ningún script de otro sitio');
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'ningún script en línea');
  assert(!/\son[a-z]+="/i.test(html.replace(/<meta[^>]*>/g, '')), 'sin manejadores en línea');
  for (const f of ['gsap.min.js', 'ScrollTrigger.min.js', 'lenis.min.js']) { assert(html.includes('landing/vendor/' + f)); assert(fs.statSync(path.join(NUBE, 'landing', 'vendor', f)).size > 5000); }
  const lic = fs.readFileSync(path.join(NUBE, 'landing', 'vendor', 'LICENCIAS.md'), 'utf8');
  for (const x of ['3.12.5', '1.1.13', 'cdnjs.cloudflare.com', 'unpkg.com', 'MIT', 'standard-license']) assert(lic.includes(x), 'LICENCIAS.md anota ' + x);
  for (const f of ['gsap.min.js', 'ScrollTrigger.min.js', 'lenis.min.js']) assert(lic.includes(crypto.createHash('sha256').update(fs.readFileSync(path.join(NUBE, 'landing', 'vendor', f))).digest('hex')), 'hash de ' + f);
  const V = JSON.parse(fs.readFileSync(path.join(NUBE, 'vercel.json'), 'utf8'));
  const rx = src => new RegExp('^' + src.replace(/:\w+\(/g, '(').replace(/\\\\/g, '\\') + '$');
  const headersPara = ruta => Object.fromEntries(V.headers.filter(h => rx(h.source).test(ruta)).flatMap(h => h.headers.map(x => [x.key.toLowerCase(), x.value])));
  const hl = headersPara('/');
  assert.strictEqual(hl['x-frame-options'], 'DENY'); assert.strictEqual(hl['x-content-type-options'], 'nosniff'); assert.strictEqual(hl['referrer-policy'], 'strict-origin-when-cross-origin');
  const csp = hl['content-security-policy'], dir = n => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(n + ' ')) || '');
  assert(/^script-src 'self'$/.test(dir('script-src')), 'scripts solo del sitio'); assert(dir('frame-ancestors') === "frame-ancestors 'none'");
  assert(!/https?:/.test(dir('style-src') + dir('font-src') + dir('script-src') + dir('connect-src')), 'la CSP no permite ningún otro sitio'); assert(dir('font-src') === "font-src 'self'" && dir('media-src').includes('blob:'));
  assert(headersPara('/landing/efectos.js')['content-security-policy'], 'también para los archivos');
  assert(!headersPara('/c/prueba')['content-security-policy'] && !headersPara('/c/prueba/api/datos')['content-security-policy'], 'el panel usa la CSP de servidor.js (no se suman dos)');
  assert.strictEqual(headersPara('/c/prueba')['x-frame-options'], 'DENY');
  const bloqueo = V.redirects.find(x => x.destination === '/no-existe'), bloqueadas = rx(bloqueo.source);
  for (const f of ['/servidor.js', '/almacen.js', '/sync.js', '/Caddyfile', '/docker-compose.yml', '/backup.sh', '/Dockerfile', '/README.md', '/package.json', '/.env.ejemplo', '/api/index.js', '/vercel.json']) assert(bloqueadas.test(f), 'bloqueado ' + f);
  for (const f of ['/', '/landing/efectos.js', '/aviso-legal.html', '/privacidad.html', '/ingesta', '/registro', '/clave-instalacion', '/c/prueba', '/c/prueba/api/login', '/salud']) assert(!bloqueadas.test(f), 'no bloqueado ' + f);
  assert.strictEqual(V.redirects.indexOf(bloqueo), 0, 'el bloqueo va antes que la mudanza de dirección');
  assert.strictEqual(V.functions['api/index.js'].includeFiles, '{panel.html,servidor.js,almacen.js,sync.js}', 'la función sigue llevando sus archivos');
  const vieja = V.redirects.find(x => x.source.includes('ingesta'));
  for (const p of ['ingesta', 'registro', 'clave-instalacion']) assert(!new RegExp('^' + vieja.source.replace('/:ruta', '')).test(p), 'la dirección vieja sigue recibiendo ' + p);
  for (const c of ['INCR', 'PEXPIRE', 'SET', 'MGET', 'DEL']) assert(SIM.usados.has(c), 'se usó ' + c);
  console.log('NUBE_SEGURIDAD_OK'); process.exit(0);
})().catch(e => { console.error('FALLO', e.stack || e.message); process.exit(1); });
