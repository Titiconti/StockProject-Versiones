// StockProject Nube — servidor central de SOLO LECTURA.
// Cada PC de comercio le ENVÍA una "foto" con sus datos (POST /ingesta); el dueño la consulta desde el
// celular entrando a <sub>.<dominio base>. El servidor nunca se conecta a las PCs y no tiene ningún
// endpoint que modifique datos comerciales.
// Sin dependencias npm: solo módulos nativos de Node 20+.
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');

const SUB_OK = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const RESERVADOS = new Set(['www', 'admin', 'api', 'app', 'panel', 'mail']);
const LIMITE_INGESTA = 8 * 1024 * 1024, LIMITE_CHICO = 64 * 1024;
const SESION_SEG = 30 * 24 * 3600;            // 30 días
const FRESCURA_MS = 120 * 1000;               // pasado este tiempo sin sync, los datos se marcan desactualizados
const LOGIN_MAX = 5, LOGIN_VENTANA = 10 * 60 * 1000;
const FALLOS_MAX = 20, FALLOS_VENTANA = 60 * 1000;
const LETRAS_CLAVE = 'abcdefghjkmnpqrstuvwxyz23456789';   // sin l, i, o, 0 ni 1: se confunden al dictarlas

const sha256 = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const igual = (a, b) => crypto.timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));
const scrypt = (clave, salt) => crypto.scryptSync(String(clave), Buffer.from(salt, 'hex'), 32).toString('hex');
const nuevoToken = () => 'spn_' + crypto.randomBytes(24).toString('hex');
const nuevaClave = () => Array.from({ length: 10 }, () => LETRAS_CLAVE[crypto.randomInt(LETRAS_CLAVE.length)]).join('');

class ErrorHttp extends Error { constructor(estado, mensaje) { super(mensaje); this.estado = estado; } }

function crear({ dataDir, dominioBase, adminToken, ahora = () => Date.now(), confiarProxy = false } = {}) {
  if (!dataDir) throw new Error('Falta dataDir');
  if (!adminToken) throw new Error('Falta adminToken');
  dominioBase = String(dominioBase || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  fs.mkdirSync(dataDir, { recursive: true });
  const PANEL = fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8');
  const rutaComercios = path.join(dataDir, 'comercios.json'), rutaSesiones = path.join(dataDir, 'sesiones.json');

  // ---------- Persistencia (JSON con escritura atómica) ----------
  function escribir(ruta, texto) {
    const tmp = ruta + '.tmp';
    fs.writeFileSync(tmp, texto);
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, ruta); return; }
      catch (e) { if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e; }   // antivirus en Windows
    }
  }
  function leer(ruta, defecto) {
    let texto;
    try { texto = fs.readFileSync(ruta, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return defecto; throw e; }
    return JSON.parse(texto);   // si está dañado preferimos no arrancar antes que pisar los datos
  }
  let comercios = leer(rutaComercios, []);
  const sesiones = new Map(Object.entries(leer(rutaSesiones, {})));   // sha256(token de sesión) -> { id, vence }
  const guardarComercios = () => escribir(rutaComercios, JSON.stringify(comercios, null, 1));
  const guardarSesiones = () => escribir(rutaSesiones, JSON.stringify(Object.fromEntries(sesiones)));
  const rutaFoto = id => path.join(dataDir, id, 'foto.json');
  const iso = () => new Date(ahora()).toISOString();
  const publico = c => ({ id: c.id, nombre: c.nombre, sub: c.sub, activo: c.activo, alta: c.alta, ultimaSync: c.ultimaSync });
  function cerrarSesiones(id) {
    let n = 0;
    for (const [k, s] of sesiones) if (s.id === id) { sesiones.delete(k); n++; }
    if (n) guardarSesiones();
  }

  // ---------- Límites de intentos (en memoria) ----------
  const intentos = new Map();   // clave -> [marcas de tiempo de los fallos]
  function fallos(clave, ventana) {
    const desde = ahora() - ventana, l = (intentos.get(clave) || []).filter(t => t > desde);
    if (l.length) intentos.set(clave, l); else intentos.delete(clave);
    return l.length;
  }
  function anotarFallo(clave) {
    if (intentos.size > 20000) intentos.clear();   // tope de memoria ante un barrido de direcciones
    intentos.set(clave, [...(intentos.get(clave) || []), ahora()]);
  }

  // ---------- Utilidades HTTP ----------
  function ipDe(req) {
    if (confiarProxy) {
      // Caddy agrega la IP real al final de X-Forwarded-For; lo anterior lo pudo inventar el cliente.
      const x = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean).pop();
      if (x) return x;
    }
    return req.socket.remoteAddress || '?';
  }
  function comunes(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
  }
  function json(res, estado, obj, extra) {
    comunes(res);
    const cuerpo = typeof obj === 'string' ? obj : JSON.stringify(obj);
    res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(cuerpo), ...extra });
    res.end(cuerpo);
  }
  function html(res, estado, cuerpo) {
    comunes(res);
    res.writeHead(estado, {
      'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(cuerpo),
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
    });
    res.end(cuerpo);
  }
  const pagina = (titulo, texto) => `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titulo} — StockProject</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F6FA;color:#12233D;font-family:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,sans-serif}main{max-width:420px;padding:24px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#5B6B84;line-height:1.5}@media(prefers-color-scheme:dark){body{background:#0C1626;color:#E8EDF6}p{color:#9DABC2}}</style></head><body><main><h1>${titulo}</h1><p>${texto}</p></main></body></html>`;

  function leerCuerpo(req, limite) {
    return new Promise((resolve, reject) => {
      // Un exceso moderado se lee y se descarta (así el cliente recibe el 413 en vez de un corte); uno enorme se rechaza de entrada.
      if (Number(req.headers['content-length']) > limite * 4) { req.resume(); return reject(new ErrorHttp(413, 'El envío es demasiado grande')); }
      const partes = []; let total = 0, pasado = false;
      req.on('data', p => { total += p.length; if (total > limite) { pasado = true; partes.length = 0; } else if (!pasado) partes.push(p); });
      req.on('end', () => pasado ? reject(new ErrorHttp(413, 'El envío es demasiado grande')) : resolve(Buffer.concat(partes).toString('utf8')));
      req.on('error', () => reject(new ErrorHttp(400, 'No se pudo leer el envío')));
    });
  }
  async function leerJson(req, limite) {
    const texto = await leerCuerpo(req, limite);
    let o;
    try { o = JSON.parse(texto); } catch { throw new ErrorHttp(400, 'El cuerpo no es JSON válido'); }
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new ErrorHttp(400, 'El cuerpo debe ser un objeto JSON');
    return o;
  }
  const bearer = req => { const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || ''); return m ? m[1] : ''; };
  function cookieSesion(req) {
    for (const par of String(req.headers.cookie || '').split(';')) {
      const i = par.indexOf('=');
      if (i > 0 && par.slice(0, i).trim() === 'sp_nube') return par.slice(i + 1).trim();
    }
    return '';
  }
  function ponerCookie(req, valor, maxAge) {
    const seguro = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
    return `sp_nube=${valor}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${seguro ? '; Secure' : ''}`;
  }

  // ¿A qué comercio apunta el pedido? null = host base (o sin subdominio); '' = subdominio inválido.
  function subDe(req) {
    const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    if (dominioBase && host === dominioBase) return null;
    if (dominioBase && host.endsWith('.' + dominioBase)) {
      const s = host.slice(0, -dominioBase.length - 1);
      return SUB_OK.test(s) && !RESERVADOS.has(s) ? s : '';
    }
    const x = req.headers['x-comercio'];   // solo para pruebas locales, cuando el Host no es del dominio
    if (x === undefined) return null;
    const s = String(x).toLowerCase();
    return SUB_OK.test(s) && !RESERVADOS.has(s) ? s : '';
  }

  // ---------- Administración ----------
  async function admin(req, res, ruta) {
    const ip = ipDe(req), kf = 'admin|' + ip;
    if (fallos(kf, FALLOS_VENTANA) >= FALLOS_MAX) return json(res, 429, { error: 'Demasiados intentos. Probá más tarde.' });
    const t = bearer(req);
    if (!t || !igual(t, adminToken)) { anotarFallo(kf); return json(res, 401, { error: 'No autorizado' }); }

    if (ruta === '/admin/comercios') {
      if (req.method === 'GET') return json(res, 200, comercios.map(publico));
      if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET, POST' });
      const b = await leerJson(req, LIMITE_CHICO);
      const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '', sub = typeof b.sub === 'string' ? b.sub.trim().toLowerCase() : '';
      if (!nombre || nombre.length > 80) throw new ErrorHttp(400, 'El nombre es obligatorio (hasta 80 caracteres)');
      if (!SUB_OK.test(sub)) throw new ErrorHttp(400, 'Subdominio inválido: de 3 a 32 letras minúsculas, números o guiones');
      if (RESERVADOS.has(sub)) throw new ErrorHttp(400, 'Ese subdominio está reservado');
      if (comercios.some(c => c.sub === sub)) throw new ErrorHttp(409, 'Ese subdominio ya está en uso');
      const n = comercios.reduce((m, c) => Math.max(m, Number(c.id.slice(6)) || 0), 0) + 1;
      const token = nuevoToken(), clave = nuevaClave(), claveSalt = crypto.randomBytes(16).toString('hex');
      const c = { id: 'store_' + String(n).padStart(3, '0'), nombre, sub, activo: true, alta: iso(), tokenHash: sha256(token), claveHash: scrypt(clave, claveSalt), claveSalt, ultimaSync: null, seq: 0 };
      comercios.push(c); guardarComercios();
      console.log(`[admin] alta ${c.id} (${c.sub})`);
      return json(res, 201, { id: c.id, sub: c.sub, url: `https://${c.sub}.${dominioBase || 'localhost'}`, token, clave });
    }
    const m = /^\/admin\/comercios\/(store_\d+)\/(token|clave|estado)$/.exec(ruta);
    if (!m) return json(res, 404, { error: 'No existe' });
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' }, { Allow: 'POST' });
    const c = comercios.find(x => x.id === m[1]);
    if (!c) return json(res, 404, { error: 'Comercio no encontrado' });
    if (m[2] === 'token') {
      req.resume();
      const token = nuevoToken();
      // Un token nuevo es una instalación nueva: la numeración de envíos vuelve a empezar.
      c.tokenHash = sha256(token); c.seq = 0; guardarComercios();
      console.log(`[admin] token nuevo para ${c.id}`);
      return json(res, 200, { id: c.id, token });
    }
    if (m[2] === 'clave') {
      req.resume();
      const clave = nuevaClave();
      c.claveSalt = crypto.randomBytes(16).toString('hex'); c.claveHash = scrypt(clave, c.claveSalt);
      guardarComercios(); cerrarSesiones(c.id);
      console.log(`[admin] clave nueva para ${c.id}`);
      return json(res, 200, { id: c.id, clave });
    }
    const b = await leerJson(req, LIMITE_CHICO);
    if (typeof b.activo !== 'boolean') throw new ErrorHttp(400, 'Falta "activo" (true o false)');
    c.activo = b.activo; guardarComercios();
    if (!c.activo) cerrarSesiones(c.id);
    console.log(`[admin] ${c.id} ${c.activo ? 'activado' : 'desactivado'}`);
    return json(res, 200, publico(c));
  }

  // ---------- Ingesta (la PC del comercio envía su foto) ----------
  async function ingesta(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' }, { Allow: 'POST' });
    const kf = 'ingesta|' + ipDe(req);
    if (fallos(kf, FALLOS_VENTANA) >= FALLOS_MAX) return json(res, 429, { error: 'Demasiados intentos. Probá más tarde.' });
    const t = bearer(req), h = t ? sha256(t) : '';
    const c = h && comercios.find(x => x.tokenHash === h);   // el comercio sale SOLO del token, nunca del Host
    if (!c || !c.activo) { anotarFallo(kf); req.resume(); return json(res, 401, { error: 'No autorizado' }); }
    const b = await leerJson(req, LIMITE_INGESTA);
    if (!Number.isSafeInteger(b.seq) || b.seq < 0) throw new ErrorHttp(400, '"seq" debe ser un número entero');
    const foto = b.foto;
    if (!foto || typeof foto !== 'object' || Array.isArray(foto)) throw new ErrorHttp(400, '"foto" debe ser un objeto');
    if (foto.ventas !== undefined && !Array.isArray(foto.ventas)) throw new ErrorHttp(400, '"foto.ventas" debe ser una lista');
    if (b.seq <= c.seq) return json(res, 200, { ok: true, seq: c.seq, repetido: true });
    fs.mkdirSync(path.join(dataDir, c.id), { recursive: true });
    escribir(rutaFoto(c.id), JSON.stringify(foto));
    c.seq = b.seq; c.ultimaSync = iso(); guardarComercios();
    return json(res, 200, { ok: true, seq: c.seq });
  }

  // ---------- Panel del comercio ----------
  function sesionDe(req, c) {
    const t = cookieSesion(req);
    if (!t) return null;
    const k = sha256(t), s = sesiones.get(k);
    if (!s) return null;
    if (s.vence <= ahora()) { sesiones.delete(k); guardarSesiones(); return null; }
    return s.id === c.id ? k : null;   // una sesión de otro comercio acá no vale
  }
  async function api(req, res, ruta, c) {
    const metodos = { '/api/login': 'POST', '/api/logout': 'POST', '/api/datos': 'GET' };
    if (!metodos[ruta]) return json(res, 404, { error: 'No existe' });
    if (req.method !== metodos[ruta]) { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: metodos[ruta] }); }
    if (!c) return json(res, 404, { error: 'Comercio no encontrado' });

    if (ruta === '/api/login') {
      const kf = 'login|' + ipDe(req) + '|' + c.id;
      if (fallos(kf, LOGIN_VENTANA) >= LOGIN_MAX) { req.resume(); return json(res, 429, { error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' }); }
      const b = await leerJson(req, LIMITE_CHICO);
      const clave = typeof b.clave === 'string' ? b.clave.trim().toLowerCase() : '';
      const bien = c.activo && clave.length > 0 && clave.length <= 200 &&
        crypto.timingSafeEqual(Buffer.from(scrypt(clave, c.claveSalt), 'hex'), Buffer.from(c.claveHash, 'hex'));
      if (!bien) { anotarFallo(kf); return json(res, 401, { error: 'Clave incorrecta' }); }
      intentos.delete(kf);
      for (const [k, s] of sesiones) if (s.vence <= ahora()) sesiones.delete(k);
      const token = crypto.randomBytes(32).toString('hex');
      sesiones.set(sha256(token), { id: c.id, vence: ahora() + SESION_SEG * 1000 });
      guardarSesiones();
      return json(res, 200, { ok: true }, { 'Set-Cookie': ponerCookie(req, token, SESION_SEG) });
    }
    if (ruta === '/api/logout') {
      req.resume();
      const k = sesionDe(req, c);
      if (k) { sesiones.delete(k); guardarSesiones(); }
      return json(res, 200, { ok: true }, { 'Set-Cookie': ponerCookie(req, '', 0) });
    }
    // GET /api/datos
    if (!c.activo || !sesionDe(req, c)) return json(res, 401, { error: 'Sesión no válida' });
    let foto = 'null';
    try { foto = await fs.promises.readFile(rutaFoto(c.id), 'utf8'); JSON.parse(foto); }
    catch (e) { if (e.code !== 'ENOENT') console.error(`[datos] foto ilegible de ${c.id}`); foto = 'null'; }
    const t = ahora(), viejo = !c.ultimaSync || foto === 'null' || t - Date.parse(c.ultimaSync) > FRESCURA_MS;
    return json(res, 200, `{"negocio":${JSON.stringify({ nombre: c.nombre })},"foto":${foto},"ultimaSync":${JSON.stringify(foto === 'null' ? null : c.ultimaSync)},"ahora":${JSON.stringify(new Date(t).toISOString())},"desactualizado":${viejo}}`);
  }

  // ---------- Enrutador ----------
  async function atender(req, res) {
    let u;
    try { u = new URL(req.url, 'http://x'); } catch { return json(res, 400, { error: 'Pedido inválido' }); }
    const ruta = u.pathname;

    if (ruta === '/salud') return json(res, 200, { ok: true });
    if (ruta === '/interno/tls-permitido') {
      const d = String(u.searchParams.get('domain') || '').toLowerCase().replace(/\.$/, '');
      let ok = false;
      if (dominioBase && d === dominioBase) ok = true;
      else if (dominioBase && d.endsWith('.' + dominioBase)) { const s = d.slice(0, -dominioBase.length - 1); ok = comercios.some(c => c.sub === s && c.activo); }
      return json(res, ok ? 200 : 404, { ok });
    }
    if (ruta === '/ingesta') return ingesta(req, res);

    const sub = subDe(req);
    if (ruta === '/admin' || ruta.startsWith('/admin/')) {
      if (sub !== null) { req.resume(); return json(res, 404, { error: 'No existe' }); }   // nunca desde el subdominio de un comercio
      return admin(req, res, ruta);
    }
    const c = sub ? comercios.find(x => x.sub === sub) : null;
    if (ruta === '/api' || ruta.startsWith('/api/')) return api(req, res, ruta, c);
    if (ruta === '/') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET' }); }
      if (sub === null) return html(res, 200, pagina('StockProject Nube', 'Para ver tu negocio entrá con la dirección de tu comercio, por ejemplo <b>micomercio.' + (dominioBase || 'tu-dominio') + '</b>.'));
      if (!c) return html(res, 404, pagina('Comercio no encontrado', 'Revisá que la dirección esté bien escrita.'));
      return html(res, 200, PANEL);
    }
    req.resume();
    return json(res, 404, { error: 'No existe' });
  }

  const srv = http.createServer((req, res) => {
    atender(req, res).catch(e => {
      if (!(e instanceof ErrorHttp)) console.error('[error]', req.method, String(req.url).split('?')[0], e && e.message);
      if (res.headersSent) return res.destroy();
      // Nunca se devuelven trazas ni rutas internas: solo un mensaje corto.
      const estado = e instanceof ErrorHttp ? e.estado : 500;
      json(res, estado, { error: e instanceof ErrorHttp ? e.message : 'Error interno' }, estado === 413 && !req.complete ? { Connection: 'close' } : undefined);
    });
  });
  srv.headersTimeout = 20000; srv.requestTimeout = 60000;

  return {
    srv,
    listen: (port, host) => new Promise((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(port, host, () => { srv.removeListener('error', reject); resolve(srv.address().port); });
    }),
    close: () => new Promise(resolve => { srv.close(() => resolve()); srv.closeAllConnections(); }),
  };
}

module.exports = { crear };

if (require.main === module) {
  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  if (!adminToken || adminToken === 'cambiar' || adminToken.length < 24) {
    console.error('Falta ADMIN_TOKEN (o es muy corto). Definí uno largo y secreto, por ejemplo con: openssl rand -hex 32');
    process.exit(1);
  }
  const dominioBase = (process.env.DOMAIN_BASE || '').trim();
  if (!dominioBase) console.warn('Aviso: DOMAIN_BASE no está definido; los comercios solo se podrán identificar con el header X-Comercio.');
  const port = Number(process.env.PORT) || 8080, dataDir = path.resolve(process.env.DATA_DIR || './datos-nube');
  const s = crear({ dataDir, dominioBase, adminToken, confiarProxy: process.env.CONFIAR_PROXY === '1' });
  s.listen(port).then(p => console.log(`StockProject Nube escuchando en el puerto ${p} (dominio base: ${dominioBase || 'sin definir'})`))
    .catch(e => { console.error('No se pudo abrir el puerto ' + port + ': ' + e.message); process.exit(1); });
  for (const señal of ['SIGTERM', 'SIGINT']) process.on(señal, () => s.close().then(() => process.exit(0)));
}
