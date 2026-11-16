// StockProject Nube — servidor central de SOLO LECTURA.
// Cada PC de comercio le ENVÍA una "foto" con sus datos (POST /ingesta); el dueño la consulta desde el
// celular entrando a <sub>.<dominio base>. El servidor nunca se conecta a las PCs y no tiene ningún
// endpoint que modifique datos comerciales.
// Sin dependencias npm: solo módulos nativos de Node 20+.
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { archivos } = require('./almacen');

const SUB_OK = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const RESERVADOS = new Set(['www', 'admin', 'api', 'app', 'panel', 'mail']);
// Foto máxima: un comercio con mucho movimiento (3000 productos, 90 días de ventas, tope de 3000 ventas) manda
// unos 2 MB. 4 MB deja el doble de margen y queda por debajo del máximo que igual acepta Vercel (4,5 MB).
const LIMITE_INGESTA = 4 * 1024 * 1024, LIMITE_CHICO = 64 * 1024;
const SESION_SEG = 30 * 24 * 3600;            // 30 días
const LOGIN_MAX = 5, LOGIN_VENTANA = 10 * 60 * 1000;
const LOGIN_COMERCIO_MAX = 30;                // intentos por comercio desde cualquier conexión, en la misma ventana
const FALLOS_MAX = 20, FALLOS_VENTANA = 60 * 1000;
// La PC envía cada 30 s solo si hubo cambios (y un latido cada 5 min): 60 en 10 min alcanza para dos PCs con margen.
const INGESTA_MAX = 60, INGESTA_VENTANA = 10 * 60 * 1000;
// Alta automática desde el programa (sin la clave de administración, que nunca va en el instalador): limitada por IP
// (por hora y por día) y con un tope diario total para que nadie pueda llenar la base creando comercios.
const REG_IP_MAX = 3, REG_IP_VENTANA = 60 * 60 * 1000, REG_IP_DIA_MAX = 10, REG_DIA_MAX = 200, DIA = 24 * 60 * 60 * 1000;
// Páginas propias que pueden mandar pedidos del navegador (la actual y la vieja). Las PCs no mandan Origin.
const ORIGENES = ['https://stockprojectapp.vercel.app', 'https://stock-project-versiones.vercel.app'];
const LETRAS_CLAVE = 'abcdefghjkmnpqrstuvwxyz23456789';   // sin l, i, o, 0 ni 1: se confunden al dictarlas

const sha256 = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const igual = (a, b) => crypto.timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));
const scrypt = (clave, salt) => crypto.scryptSync(String(clave), Buffer.from(salt, 'hex'), 32).toString('hex');
const nuevoToken = () => 'spn_' + crypto.randomBytes(24).toString('hex');
const nuevaClave = () => Array.from({ length: 10 }, () => LETRAS_CLAVE[crypto.randomInt(LETRAS_CLAVE.length)]).join('');
const idDe = n => 'store_' + String(n).padStart(3, '0');
const numDe = id => Number(String(id).slice(6)) || 0;

// Clave elegida por el cliente: 8 a 64 caracteres, con letras y números, distinta del nombre del negocio.
function errorClave(clave, nombre) {
  if (typeof clave !== 'string') return 'La clave tiene que ser un texto';
  const k = clave.trim();
  if (k.length < 8 || k.length > 64) return 'La clave tiene que tener entre 8 y 64 caracteres';
  if (!/\p{L}/u.test(k) || !/\p{N}/u.test(k)) return 'La clave tiene que tener al menos una letra y un número';
  if (nombre && k.toLowerCase() === String(nombre).trim().toLowerCase()) return 'La clave no puede ser igual al nombre del negocio';
  return '';
}
// Las claves generadas (y las de comercios viejos, sin claveTipo) no distinguen mayúsculas; las propias sí.
const normalizarClave = (clave, tipo) => tipo === 'propia' ? clave.trim() : clave.trim().toLowerCase();

class ErrorHttp extends Error { constructor(estado, mensaje) { super(mensaje); this.estado = estado; } }

// almacen: dónde se guardan los datos (por defecto, archivos en dataDir). Todo se lee del almacén en cada pedido, así
// que pueden correr varias copias a la vez (funciones de Vercel). "recargar" se acepta por compatibilidad y ya no hace
// falta. frescuraMs: pasado ese tiempo sin noticias del comercio, el panel avisa que los datos pueden no estar al día.
function crear({ dataDir, almacen, frescuraMs = 120 * 1000, dominioBase, adminToken, ahora = () => Date.now(), confiarProxy = false, origenes = ORIGENES } = {}) {
  if (!almacen && !dataDir) throw new Error('Falta dataDir o almacen');
  if (!almacen) almacen = archivos(dataDir);
  const FRESCURA_MS = frescuraMs;
  if (!adminToken) throw new Error('Falta adminToken');
  dominioBase = String(dominioBase || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  const PANEL = fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8');

  // ---------- Persistencia ----------
  // Una clave por cosa, para que dos pedidos simultáneos nunca se pisen:
  //   comercio:<id> (datos fijos: nombre, claves, activo) · sub:<sub> → id · token:<hash> → id · ids:comercio (INCR)
  //   estado:<id> {seq, ultimaSync} · foto:<id> (comprimida) · sesion:<hash> {id, vence, gen} (vence sola)
  //   lim:<límite>:<ventana> contadores atómicos de intentos.
  // Formato viejo (hasta 5.6.x): "comercios" (lista) y "sesiones" (objeto) enteros. Se copian una vez al formato nuevo y
  // se dejan como estaban (por si hubiera que volver a la versión anterior). "version-datos" = '2' marca la mudanza hecha.
  const K = { com: id => 'comercio:' + id, sub: s => 'sub:' + s, tok: h => 'token:' + h, ses: h => 'sesion:' + h, est: id => 'estado:' + id, foto: id => 'foto:' + id };
  const fijos = c => { const { seq, ultimaSync, ...r } = c; return r; };
  const guardar = c => almacen.escribir(K.com(c.id), JSON.stringify(fijos(c)));
  const guardarEstado = c => almacen.escribir(K.est(c.id), JSON.stringify({ seq: c.seq, ultimaSync: c.ultimaSync }));
  const comprimir = t => 'gz:' + zlib.gzipSync(Buffer.from(t, 'utf8')).toString('base64');
  const descomprimir = t => t && t.startsWith('gz:') ? zlib.gunzipSync(Buffer.from(t.slice(3), 'base64')).toString('utf8') : t;
  const iso = () => new Date(ahora()).toISOString();
  const publico = c => ({ id: c.id, nombre: c.nombre, sub: c.sub, activo: c.activo, alta: c.alta, ultimaSync: c.ultimaSync });

  let mudado = false;
  async function mudar() {
    if (mudado) return;
    const [v, viejos, sesViejas] = await almacen.leerVarios(['version-datos', 'comercios', 'sesiones']);
    if (v === '2') { mudado = true; return; }
    const lista = viejos ? JSON.parse(viejos) : [];   // si está dañado preferimos fallar antes que pisar los datos
    let max = 0;
    // crearSiNo: si otra copia ya mudó (o ya hubo cambios nuevos), lo nuevo no se pisa con lo viejo.
    for (const c of lista) {
      await almacen.crearSiNo(K.com(c.id), JSON.stringify(fijos(c)));
      await almacen.crearSiNo(K.sub(c.sub), c.id);
      if (c.tokenHash) await almacen.crearSiNo(K.tok(c.tokenHash), c.id);
      max = Math.max(max, numDe(c.id));
    }
    if (max) await almacen.crearSiNo('ids:comercio', String(max));
    const t = ahora();
    for (const [k, s] of Object.entries(sesViejas ? JSON.parse(sesViejas) : {}))
      if (s && s.vence > t) await almacen.crearSiNo(K.ses(k), JSON.stringify(s), s.vence - t);
    await almacen.escribir('version-datos', '2');
    mudado = true;
    if (lista.length) console.log(`[datos] ${lista.length} comercio(s) pasados al formato nuevo`);
  }
  async function porId(id, conEstado = true) {
    const [t, e] = await almacen.leerVarios([K.com(id), K.est(id)]);
    if (!t) return null;
    const c = JSON.parse(t), x = conEstado && e ? JSON.parse(e) : {};
    return { ...c, seq: x.seq || 0, ultimaSync: x.ultimaSync || null };
  }
  async function porSub(sub) {
    if (!sub) return null;
    const id = await almacen.leer(K.sub(sub)), c = id && await porId(id);
    return c && c.sub === sub ? c : null;
  }
  async function porToken(h) {
    if (!h) return null;
    const id = await almacen.leer(K.tok(h)), c = id && await porId(id);
    return c && c.tokenHash === h ? c : null;   // el índice podría quedar viejo: manda lo guardado en el comercio
  }
  async function todos() {
    const n = Number(await almacen.leer('ids:comercio')) || 0;
    if (!n) return [];
    const ids = Array.from({ length: n }, (_, i) => idDe(i + 1));
    const [cs, es] = await Promise.all([almacen.leerVarios(ids.map(K.com)), almacen.leerVarios(ids.map(K.est))]);
    return cs.map((t, i) => { if (!t) return null; const e = es[i] ? JSON.parse(es[i]) : {}; return { ...JSON.parse(t), seq: e.seq || 0, ultimaSync: e.ultimaSync || null }; }).filter(Boolean);
  }
  // Cerrar todas las sesiones de un comercio = pasar a la generación siguiente (las sesiones guardan la suya).
  const nuevaGeneracion = c => { c.sesGen = (c.sesGen || 0) + 1; };

  // ---------- Límites de intentos (contadores atómicos por ventana fija) ----------
  const claveLimite = (nombre, ventana) => 'lim:' + nombre + ':' + Math.floor(ahora() / ventana);
  const sumarIntento = (nombre, ventana) => almacen.sumar(claveLimite(nombre, ventana), ventana);
  const intentos = async (nombre, ventana) => Number(await almacen.leer(claveLimite(nombre, ventana))) || 0;
  const olvidar = (nombre, ventana) => almacen.borrar(claveLimite(nombre, ventana));

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
    res.setHeader('X-Frame-Options', 'DENY');
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
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
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
  // Solo JSON de verdad: un formulario de otra página (text/plain, form-urlencoded) no puede mandar estos pedidos.
  async function leerJson(req, limite) {
    const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (tipo !== 'application/json') { req.resume(); throw new ErrorHttp(415, 'El envío tiene que ser JSON (Content-Type: application/json)'); }
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
    const camino = req.spPrefijo || '/';
    const seguro = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
    return `sp_nube=${valor}; HttpOnly; SameSite=Strict; Path=${camino}; Max-Age=${maxAge}${seguro ? '; Secure' : ''}`;
  }
  function baseDe(req) {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    return /^[a-z0-9.-]+(:\d+)?$/.test(host) ? proto + '://' + host : '';
  }
  // Sin Origin (la PC, curl) se acepta; con Origin tiene que ser una página nuestra o la misma dirección del pedido.
  function origenBien(req) {
    const o = req.headers.origin;
    if (o === undefined) return true;
    const x = String(o).toLowerCase();
    if (origenes.includes(x) || (baseDe(req) && x === baseDe(req))) return true;
    if (dominioBase) { const h = x.replace(/^https:\/\//, ''); if (x.startsWith('https://') && (h === dominioBase || h.endsWith('.' + dominioBase))) return true; }
    return false;
  }

  // ¿A qué comercio apunta el pedido? null = host base (o sin subdominio); '' = subdominio inválido.
  function subDe(req) {
    if (req.spSub !== undefined) return req.spSub;   // dirección del tipo /c/<comercio>/…
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

  // ---------- Alta de un comercio (la usan la administración y el registro automático) ----------
  function ponerClave(c, clave, tipo) {
    c.claveSalt = crypto.randomBytes(16).toString('hex'); c.claveTipo = tipo; c.claveHash = scrypt(normalizarClave(clave, tipo), c.claveSalt);
  }
  // Número nuevo con INCR (dos altas a la vez nunca reciben el mismo); si ya existe (datos viejos), el siguiente.
  async function nuevoId() {
    for (;;) { const id = idDe(await almacen.sumar('ids:comercio')); if (!(await almacen.leer(K.com(id)))) return id; }
  }
  // subs: lista de direcciones a probar en orden; se reserva la primera libre de forma atómica. null = todas ocupadas.
  async function alta(nombre, subs, origen, propia) {
    const id = await nuevoId();
    let sub = null;
    for (const s of subs) if (!RESERVADOS.has(s) && SUB_OK.test(s) && await almacen.crearSiNo(K.sub(s), id)) { sub = s; break; }
    if (!sub) return null;
    const token = nuevoToken(), clave = propia ? propia.trim() : nuevaClave();
    const c = { id, nombre, sub, activo: true, alta: iso(), origen, tokenHash: sha256(token), ultimaSync: null, seq: 0, sesGen: 0 };
    ponerClave(c, clave, propia ? 'propia' : 'generada');
    await guardar(c); await almacen.escribir(K.tok(c.tokenHash), id); await guardarEstado(c);
    console.log(`[${origen}] alta ${c.id} (${c.sub})`);
    return propia ? { id: c.id, sub: c.sub, token } : { id: c.id, sub: c.sub, token, clave };
  }
  // Direcciones candidatas a partir del nombre ("Kiosco Ana" → "kiosco-ana", "kiosco-ana-2"…, y una al azar al final).
  function subsPara(nombre) {
    let b = String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28).replace(/-+$/, '');
    if (b.length < 3) b = ('comercio-' + b).replace(/-+$/, '');
    const l = [b]; for (let i = 2; i < 100; i++) l.push(b + '-' + i);
    l.push(b.slice(0, 20) + '-' + crypto.randomBytes(3).toString('hex'));
    return l;
  }
  async function registro(req, res) {
    if (req.method !== 'POST') { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: 'POST' }); }
    const b = await leerJson(req, LIMITE_CHICO);
    const nombre = typeof b.nombre === 'string' ? b.nombre.replace(/\s+/g, ' ').trim() : '';
    if (nombre.length < 2 || nombre.length > 80) throw new ErrorHttp(400, 'El nombre del negocio tiene que tener entre 2 y 80 caracteres');
    if (b.clave !== undefined && b.clave !== null && b.clave !== '') { const e = errorClave(b.clave, nombre); if (e) throw new ErrorHttp(400, e); }
    const propia = typeof b.clave === 'string' && b.clave ? b.clave : '';
    // Cuentan las altas (no solo los errores). Cada contador se suma antes de decidir: pedidos en paralelo no lo esquivan.
    const ip = ipDe(req);
    if (await sumarIntento('registro|' + ip, REG_IP_VENTANA) > REG_IP_MAX) return json(res, 429, { error: 'Se crearon demasiados paneles desde esta conexión. Probá en una hora.' });
    if (await sumarIntento('registro-dia|' + ip, DIA) > REG_IP_DIA_MAX) return json(res, 429, { error: 'Se crearon demasiados paneles desde esta conexión. Probá mañana.' });
    if (await sumarIntento('registro|total', DIA) > REG_DIA_MAX) return json(res, 503, { error: 'Hoy no se pueden crear más paneles. Probá mañana.' });
    const r = await alta(nombre, subsPara(nombre), 'registro', propia), base = baseDe(req);
    if (!r) throw new ErrorHttp(409, 'No se encontró una dirección libre para ese nombre');
    const panel = dominioBase ? `https://${r.sub}.${dominioBase}` : (base ? base : '') + `/c/${r.sub}`;
    return json(res, 201, { ...r, panel });
  }

  // ---------- Administración ----------
  async function admin(req, res, ruta) {
    const kf = 'admin|' + ipDe(req);
    if (await intentos(kf, FALLOS_VENTANA) >= FALLOS_MAX) { req.resume(); return json(res, 429, { error: 'Demasiados intentos. Probá más tarde.' }); }
    const t = bearer(req);
    if (!t || !igual(t, adminToken)) { await sumarIntento(kf, FALLOS_VENTANA); req.resume(); return json(res, 401, { error: 'No autorizado' }); }

    if (ruta === '/admin/comercios') {
      if (req.method === 'GET') return json(res, 200, (await todos()).map(publico));
      if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET, POST' });
      const b = await leerJson(req, LIMITE_CHICO);
      const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '', sub = typeof b.sub === 'string' ? b.sub.trim().toLowerCase() : '';
      if (!nombre || nombre.length > 80) throw new ErrorHttp(400, 'El nombre es obligatorio (hasta 80 caracteres)');
      if (!SUB_OK.test(sub)) throw new ErrorHttp(400, 'Subdominio inválido: de 3 a 32 letras minúsculas, números o guiones');
      if (RESERVADOS.has(sub)) throw new ErrorHttp(400, 'Ese subdominio está reservado');
      if (await almacen.leer(K.sub(sub))) throw new ErrorHttp(409, 'Ese subdominio ya está en uso');
      const r = await alta(nombre, [sub], 'admin');
      if (!r) throw new ErrorHttp(409, 'Ese subdominio ya está en uso');
      return json(res, 201, { ...r, url: dominioBase ? `https://${r.sub}.${dominioBase}` : `/c/${r.sub}` });
    }
    const m = /^\/admin\/comercios\/(store_\d+)\/(token|clave|estado)$/.exec(ruta);
    if (!m) return json(res, 404, { error: 'No existe' });
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' }, { Allow: 'POST' });
    const c = await porId(m[1]);
    if (!c) { req.resume(); return json(res, 404, { error: 'Comercio no encontrado' }); }
    if (m[2] === 'token') {
      req.resume();
      const token = nuevoToken(), viejo = c.tokenHash;
      // Un token nuevo es una instalación nueva: la numeración de envíos vuelve a empezar.
      c.tokenHash = sha256(token); c.seq = 0;
      await almacen.escribir(K.tok(c.tokenHash), c.id); await guardar(c); await guardarEstado(c);
      if (viejo) await almacen.borrar(K.tok(viejo));
      console.log(`[admin] token nuevo para ${c.id}`);
      return json(res, 200, { id: c.id, token });
    }
    if (m[2] === 'clave') {
      req.resume();
      const clave = nuevaClave();
      ponerClave(c, clave, 'generada'); nuevaGeneracion(c); await guardar(c);
      console.log(`[admin] clave nueva para ${c.id}`);
      return json(res, 200, { id: c.id, clave });
    }
    const b = await leerJson(req, LIMITE_CHICO);
    if (typeof b.activo !== 'boolean') throw new ErrorHttp(400, 'Falta "activo" (true o false)');
    c.activo = b.activo; if (!c.activo) nuevaGeneracion(c);
    await guardar(c);
    console.log(`[admin] ${c.id} ${c.activo ? 'activado' : 'desactivado'}`);
    return json(res, 200, publico(c));
  }

  // ---------- Ingesta (la PC del comercio envía su foto) ----------
  // El comercio sale SOLO del token, nunca del Host. Los fallos por IP frenan a quien prueba tokens al azar.
  async function instalacion(req, res) {
    const kf = 'ingesta|' + ipDe(req);
    if (await intentos(kf, FALLOS_VENTANA) >= FALLOS_MAX) { req.resume(); json(res, 429, { error: 'Demasiados intentos. Probá más tarde.' }); return null; }
    const t = bearer(req), c = t ? await porToken(sha256(t)) : null;
    if (!c || !c.activo) { await sumarIntento(kf, FALLOS_VENTANA); req.resume(); json(res, 401, { error: 'No autorizado' }); return null; }
    return c;
  }
  async function ingesta(req, res) {
    if (req.method !== 'POST') { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: 'POST' }); }
    const c = await instalacion(req, res); if (!c) return;
    if (await sumarIntento('ingesta-token|' + c.id, INGESTA_VENTANA) > INGESTA_MAX) { req.resume(); return json(res, 429, { error: 'Demasiados envíos seguidos. Se reintenta solo.' }); }
    const b = await leerJson(req, LIMITE_INGESTA);
    if (!Number.isSafeInteger(b.seq) || b.seq < 0) throw new ErrorHttp(400, '"seq" debe ser un número entero');
    const foto = b.foto;
    if (!foto || typeof foto !== 'object' || Array.isArray(foto)) throw new ErrorHttp(400, '"foto" debe ser un objeto');
    if (foto.ventas !== undefined && !Array.isArray(foto.ventas)) throw new ErrorHttp(400, '"foto.ventas" debe ser una lista');
    if (b.seq <= c.seq) return json(res, 200, { ok: true, seq: c.seq, repetido: true });
    await almacen.escribir(K.foto(c.id), comprimir(JSON.stringify(foto)));
    c.seq = b.seq; c.ultimaSync = iso(); await guardarEstado(c);
    return json(res, 200, { ok: true, seq: c.seq });
  }

  // ---------- Cambio de clave desde el programa (token de instalación; la PC ya es dueña del comercio) ----------
  async function claveInstalacion(req, res) {
    if (req.method !== 'POST') { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: 'POST' }); }
    const c = await instalacion(req, res); if (!c) return;
    const b = await leerJson(req, LIMITE_CHICO);
    const e = errorClave(b.nueva, c.nombre); if (e) throw new ErrorHttp(400, e);
    ponerClave(c, b.nueva, 'propia'); nuevaGeneracion(c); await guardar(c);
    console.log(`[clave] clave cambiada desde la instalación de ${c.id}`);
    return json(res, 200, { ok: true });
  }

  // ---------- Panel del comercio ----------
  // Devuelve { k, s } de la sesión válida para ese comercio, o null.
  async function sesionDe(req, c) {
    const t = cookieSesion(req);
    if (!t) return null;
    const k = sha256(t), txt = await almacen.leer(K.ses(k));
    if (!txt) return null;
    const s = JSON.parse(txt);
    if (s.vence <= ahora()) { await almacen.borrar(K.ses(k)); return null; }
    if (s.id !== c.id || (s.gen || 0) !== (c.sesGen || 0)) return null;   // de otro comercio, o cerrada por un cambio de clave
    return { k, s };
  }
  const claveBien = (c, clave) => typeof clave === 'string' && clave.trim().length > 0 && clave.length <= 200 &&
    crypto.timingSafeEqual(Buffer.from(scrypt(normalizarClave(clave, c.claveTipo), c.claveSalt), 'hex'), Buffer.from(c.claveHash, 'hex'));
  // Cada intento suma antes de probar la clave: por conexión y comercio, y por comercio desde cualquier conexión.
  async function frenoLogin(req, res, c) {
    const kf = 'login|' + ipDe(req) + '|' + c.id;
    if (await sumarIntento(kf, LOGIN_VENTANA) > LOGIN_MAX || await sumarIntento('login-comercio|' + c.id, LOGIN_VENTANA) > LOGIN_COMERCIO_MAX) {
      req.resume(); json(res, 429, { error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' }); return null;
    }
    return kf;
  }
  async function api(req, res, ruta, c) {
    const metodos = { '/api/login': 'POST', '/api/logout': 'POST', '/api/clave': 'POST', '/api/datos': 'GET' };
    if (!metodos[ruta]) { req.resume(); return json(res, 404, { error: 'No existe' }); }
    if (req.method !== metodos[ruta]) { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: metodos[ruta] }); }
    if (!c) { req.resume(); return json(res, 404, { error: 'Comercio no encontrado' }); }

    if (ruta === '/api/login') {
      const kf = await frenoLogin(req, res, c); if (!kf) return;
      const b = await leerJson(req, LIMITE_CHICO);
      if (!(c.activo && claveBien(c, b.clave))) return json(res, 401, { error: 'Clave incorrecta' });
      await olvidar(kf, LOGIN_VENTANA);
      const token = crypto.randomBytes(32).toString('hex');
      await almacen.escribir(K.ses(sha256(token)), JSON.stringify({ id: c.id, vence: ahora() + SESION_SEG * 1000, gen: c.sesGen || 0 }), SESION_SEG * 1000);
      return json(res, 200, { ok: true }, { 'Set-Cookie': ponerCookie(req, token, SESION_SEG) });
    }
    if (ruta === '/api/logout') {
      req.resume();
      const x = await sesionDe(req, c);
      if (x) await almacen.borrar(K.ses(x.k));
      return json(res, 200, { ok: true }, { 'Set-Cookie': ponerCookie(req, '', 0) });
    }
    if (ruta === '/api/clave') {
      const x = c.activo && await sesionDe(req, c);
      if (!x) { req.resume(); return json(res, 401, { error: 'Sesión no válida' }); }
      const kf = await frenoLogin(req, res, c); if (!kf) return;
      const b = await leerJson(req, LIMITE_CHICO);
      if (!claveBien(c, b.actual)) return json(res, 401, { error: 'La clave actual no es correcta' });
      const e = errorClave(b.nueva, c.nombre); if (e) throw new ErrorHttp(400, e);
      // Se cierran las demás sesiones; la de este celular pasa a la generación nueva y sigue abierta.
      ponerClave(c, b.nueva, 'propia'); nuevaGeneracion(c); await guardar(c);
      const resta = x.s.vence - ahora();
      if (resta > 0) await almacen.escribir(K.ses(x.k), JSON.stringify({ ...x.s, gen: c.sesGen }), resta);
      await olvidar(kf, LOGIN_VENTANA);
      return json(res, 200, { ok: true });
    }
    // GET /api/datos
    if (!c.activo || !(await sesionDe(req, c))) return json(res, 401, { error: 'Sesión no válida' });
    let foto = 'null';
    try { const t0 = descomprimir(await almacen.leer(K.foto(c.id))); if (t0) { JSON.parse(t0); foto = t0; } }
    catch (e) { console.error(`[datos] foto ilegible de ${c.id}`); foto = 'null'; }
    const t = ahora(), viejo = !c.ultimaSync || foto === 'null' || t - Date.parse(c.ultimaSync) > FRESCURA_MS;
    return json(res, 200, `{"negocio":${JSON.stringify({ nombre: c.nombre })},"foto":${foto},"ultimaSync":${JSON.stringify(foto === 'null' ? null : c.ultimaSync)},"ahora":${JSON.stringify(new Date(t).toISOString())},"desactualizado":${viejo}}`);
  }

  // ---------- Enrutador ----------
  async function atender(req, res) {
    let u;
    try { u = new URL(req.url, 'http://x'); } catch { req.resume(); return json(res, 400, { error: 'Pedido inválido' }); }
    let ruta = u.pathname;
    if (ruta === '/salud') { req.resume(); return json(res, 200, { ok: true }); }
    if (req.method !== 'GET' && req.method !== 'HEAD' && !origenBien(req)) { req.resume(); return json(res, 403, { error: 'Pedido de otra página: no permitido' }); }
    await mudar();
    const mc = /^\/c\/([^/]+)(\/.*)?$/.exec(ruta);
    if (mc) { const s0 = mc[1].toLowerCase(); req.spSub = SUB_OK.test(s0) && !RESERVADOS.has(s0) ? s0 : ''; req.spPrefijo = '/c/' + s0; ruta = mc[2] || '/'; }

    if (ruta === '/interno/tls-permitido') {
      const d = String(u.searchParams.get('domain') || '').toLowerCase().replace(/\.$/, '');
      let ok = false;
      if (dominioBase && d === dominioBase) ok = true;
      else if (dominioBase && d.endsWith('.' + dominioBase)) { const s = d.slice(0, -dominioBase.length - 1), c = SUB_OK.test(s) ? await porSub(s) : null; ok = !!(c && c.activo); }
      return json(res, ok ? 200 : 404, { ok });
    }
    if (ruta === '/ingesta') return ingesta(req, res);
    if (ruta === '/registro') return registro(req, res);
    if (ruta === '/clave-instalacion') return claveInstalacion(req, res);

    const sub = subDe(req);
    if (ruta === '/admin' || ruta.startsWith('/admin/')) {
      if (sub !== null) { req.resume(); return json(res, 404, { error: 'No existe' }); }   // nunca desde el subdominio de un comercio
      return admin(req, res, ruta);
    }
    const esApi = ruta === '/api' || ruta.startsWith('/api/');
    if (!esApi && ruta !== '/') { req.resume(); return json(res, 404, { error: 'No existe' }); }
    const c = sub ? await porSub(sub) : null;
    if (esApi) return api(req, res, ruta, c);
    if (req.method !== 'GET' && req.method !== 'HEAD') { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET' }); }
    if (sub === null) return html(res, 200, pagina('StockProject', 'Para ver tu negocio entrá con la dirección de tu comercio. Te la dio quien te instaló el programa.'));
    if (!c) return html(res, 404, pagina('Comercio no encontrado', 'Revisá que la dirección esté bien escrita.'));
    return html(res, 200, req.spPrefijo ? PANEL.replace(/(['"`])\/api\//g, '$1' + req.spPrefijo + '/api/') : PANEL);
  }

  function manejar(req, res) {
    return atender(req, res).catch(e => {
      if (!(e instanceof ErrorHttp)) console.error('[error]', req.method, String(req.url).split('?')[0], e && e.message);
      if (res.headersSent) return res.destroy();
      // Nunca se devuelven trazas ni rutas internas: solo un mensaje corto.
      const estado = e instanceof ErrorHttp ? e.estado : 500;
      json(res, estado, { error: e instanceof ErrorHttp ? e.message : 'Error interno' }, (estado === 413 || estado === 415) && !req.complete ? { Connection: 'close' } : undefined);
    });
  }
  const srv = http.createServer(manejar);
  srv.headersTimeout = 20000; srv.requestTimeout = 60000;

  return {
    srv, manejar,
    listen: (port, host) => new Promise((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(port, host, () => { srv.removeListener('error', reject); resolve(srv.address().port); });
    }),
    close: () => new Promise(resolve => { if (!srv.listening) return resolve(); srv.close(() => resolve()); srv.closeAllConnections(); }),
  };
}

module.exports = { crear, LIMITE_INGESTA };

if (require.main === module) {
  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  if (!adminToken || adminToken === 'cambiar' || adminToken.length < 24) {
    console.error('Falta ADMIN_TOKEN (o es muy corto). Definí uno largo y secreto, por ejemplo con: openssl rand -hex 32');
    process.exit(1);
  }
  const dominioBase = (process.env.DOMAIN_BASE || '').trim();
  if (!dominioBase) console.warn('Aviso: DOMAIN_BASE no está definido; los comercios solo se podrán identificar con el header X-Comercio.');
  const port = Number(process.env.PORT) || 8080, dataDir = path.resolve(process.env.DATA_DIR || './datos-nube');
  const s = crear({ dataDir, dominioBase, adminToken, confiarProxy: process.env.CONFIAR_PROXY === '1', frescuraMs: (Number(process.env.FRESCURA_SEG) || 420) * 1000 });
  s.listen(port).then(p => console.log(`StockProject Nube escuchando en el puerto ${p} (dominio base: ${dominioBase || 'sin definir'})`))
    .catch(e => { console.error('No se pudo abrir el puerto ' + port + ': ' + e.message); process.exit(1); });
  for (const señal of ['SIGTERM', 'SIGINT']) process.on(señal, () => s.close().then(() => process.exit(0)));
}
