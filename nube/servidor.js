// StockProject Nube — servidor central de SOLO LECTURA.
// Cada PC de comercio le ENVÍA una "foto" con sus datos (POST /ingesta); el dueño la consulta desde el
// celular entrando a <sub>.<dominio base>. El servidor nunca se conecta a las PCs y no tiene ningún
// endpoint que modifique datos comerciales.
// Sin dependencias npm: solo módulos nativos de Node 20+.
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { archivos } = require('./almacen');
const sincro = require('./sync'), { ErrorHttp, CAMPOS_ESTADO, estadoDe, conEstado } = sincro;

// 3 a 32 caracteres, sin guion en los bordes ni "--" (así tampoco entra "xn--", que es la marca de las direcciones con acentos o símbolos parecidos a letras).
const SUB_OK = /^(?!.*--)[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
// Nombres que no se dan a ningún comercio: rutas del servidor, secciones del sitio y nombres que suplantarían al soporte o a organismos.
// "prueba" no está: es un comercio que ya existe.
const RESERVADOS = new Set(['www', 'admin', 'api', 'app', 'panel', 'mail', 'c', 'cuenta', 'cuentas', 'registro', 'ingesta', 'salud', 'interno', 'login', 'logout',
  'landing', 'static', 'assets', 'stockproject', 'stock', 'soporte', 'ayuda', 'hola', 'ventas', 'privacidad', 'legal', 'contacto', 'info', 'status', 'blog', 'docs',
  'afip', 'arca', 'mercadopago', 'telegram', 'whatsapp', 'oficial', 'root', 'ns1', 'ns2', 'smtp', 'ftp']);
// Foto máxima: un comercio con mucho movimiento (3000 productos, 90 días de ventas, tope de 3000 ventas) manda
// unos 2 MB. 4 MB deja el doble de margen y queda por debajo del máximo que igual acepta Vercel (4,5 MB).
const LIMITE_INGESTA = 4 * 1024 * 1024, LIMITE_CHICO = 64 * 1024;
const SESION_SEG = 30 * 24 * 3600;            // 30 días
const LOGIN_MAX = 5, LOGIN_VENTANA = 10 * 60 * 1000;
const LOGIN_COMERCIO_MAX = 30;                // intentos por comercio desde cualquier conexión, en la misma ventana
const FALLOS_MAX = 20, FALLOS_VENTANA = 60 * 1000;
// La PC envía cada 30 s solo si hubo cambios (y un latido cada 5 min): 60 en 10 min alcanza para dos PCs con margen.
const INGESTA_MAX = 60, INGESTA_VENTANA = 10 * 60 * 1000;
// Envíos por diferencias (/ingesta/ops): la PC manda uno por cambio (mínimo 3 s entre envíos) y un latido cada 10 min.
const PRECIOS_POR_MINUTO = 20, OPS_MAX = 300, LIMITE_OPS = 1024 * 1024, UMBRAL_AVISO_USO = 70;
// "ver" que ve el panel: opaco (no deja contar cuántos envíos hubo). La respuesta de /api/ver puede guardarse 1 s en la caché de la CDN.
const CACHE_VER = 'public, max-age=0, s-maxage=1, stale-while-revalidate=1';
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
  const K = { cmds: id => 'cmds:' + id, cola: h => 'cola:' + h, cmdv: id => 'cmdv:' + id, base: id => 'base:' + id, vd: (id, d) => 'vd:' + id + ':' + d, com: id => 'comercio:' + id, sub: s => 'sub:' + s, tok: h => 'token:' + h, ses: h => 'sesion:' + h, est: id => 'estado:' + id, foto: id => 'foto:' + id };
  // estado:<id> cambia en cada envío (aparte de los datos fijos): seq (fotos), inst+ultOp (diferencias), ver (cambia con cada dato
  // nuevo) y modo ('foto' = documento único de las versiones viejas; 'dif' = base:<id> + vd:<id>:<día> con las ventas de cada día).
  const fijos = c => { const r = { ...c }; CAMPOS_ESTADO.forEach(k => delete r[k]); return r; };
  const guardar = c => almacen.escribir(K.com(c.id), JSON.stringify(fijos(c)));
  const guardarEstado = c => almacen.escribir(K.est(c.id), JSON.stringify(estadoDe(c)));
  const comprimir = t => 'gz:' + zlib.gzipSync(Buffer.from(t, 'utf8')).toString('base64');
  const descomprimir = t => t && t.startsWith('gz:') ? zlib.gunzipSync(Buffer.from(t.slice(3), 'base64')).toString('utf8') : t;
  const iso = () => new Date(ahora()).toISOString();
  const datos = sincro.crear({ almacen, K, comprimir, descomprimir, ahora });
  const memoVer = new Map(), MEMO_VER_MS = 10000;
  const verDe = c => sha256(c.id + ':' + (c.ver || 0) + ':' + (c.cmdv || 0)).slice(0, 12);
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
  async function porId(id) {
    const [t, e, v] = await almacen.leerVarios([K.com(id), K.est(id), K.cmdv(id)]);   // un solo MGET: el contador de cambios no cuesta un comando más
    return t ? conEstado(JSON.parse(t), e ? JSON.parse(e) : {}, v) : null;
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
    return cs.map((t, i) => t ? conEstado(JSON.parse(t), es[i] ? JSON.parse(es[i]) : {}) : null).filter(Boolean);
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
    await guardar(c); await almacen.escribir(K.tok(c.tokenHash), id); await guardarEstado(c); await almacen.escribir(K.cola(c.tokenHash), '[]');
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
      if (viejo) { await almacen.borrar(K.tok(viejo)); await almacen.borrar(K.cola(viejo)); }
      await almacen.escribir(K.cola(c.tokenHash), '[]');   // los cambios pendientes de la instalación anterior se descartan
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
  // POST /ingesta/ops: cambios desde el último envío confirmado (las reglas están en sync.js, que no depende de Node).
  async function ops(req, res) {
    if (req.method !== 'POST') { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: 'POST' }); }
    const c = await instalacion(req, res); if (!c) return;
    if (await sumarIntento('ops-token|' + c.id, INGESTA_VENTANA) > OPS_MAX) { req.resume(); return json(res, 429, { error: 'Demasiados envíos seguidos. Se reintenta solo.' }); }
    const r = await datos.aplicarOps(c, await leerJson(req, LIMITE_OPS));
    return json(res, r.estado, { ...r.cuerpo, cv: c.cmdv || 0 });   // cv: si cambió, la PC pregunta por cambios de precio pendientes
  }
  // POST /ingesta { seq, foto[, inst, n] }: la foto entera. Sin "inst" (versiones viejas) se guarda como documento único; con
  // "inst" (versiones nuevas) se reparte en base + días y fija desde dónde cuentan las diferencias (n).
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
    if (b.inst === undefined) {
      c.seq = b.seq; c.inst = null; c.ultOp = 0; c.modo = 'foto'; c.ver = (c.ver || 0) + 1; c.ultimaSync = iso();
      await almacen.escribirVarios([[K.foto(c.id), comprimir(JSON.stringify(foto))], [K.est(c.id), JSON.stringify(estadoDe(c))]]);
    } else {
      if (typeof b.inst !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(b.inst) || !Number.isSafeInteger(b.n) || b.n < 1) throw new ErrorHttp(400, '"inst" y "n" no son válidos');
      await datos.guardarFoto(c, foto, b);
    }
    return json(res, 200, b.inst === undefined ? { ok: true, seq: c.seq } : { ok: true, seq: c.seq, cv: c.cmdv || 0 });
  }
  // GET /ingesta/pendientes: lo que el dueño pidió cambiar desde el celular. Una sola lectura (cola:<hash del token>); el token es
  // la credencial. Sin cola todavía (comercio anterior) se valida el token una vez y se crea.
  async function pendientes(req, res) {
    if (req.method !== 'GET') { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET' }); }
    const t = bearer(req); if (!t) return json(res, 401, { error: 'No autorizado' });
    let p = await datos.pendientes(sha256(t));
    if (p === null) { const c = await instalacion(req, res); if (!c) return; await datos.iniciarCola(c); p = []; }
    return json(res, 200, { pendientes: p });
  }
  // POST /ingesta/ack { resultados:[{id, estado:'aplicado'|'rechazado', motivo}] }: la PC confirma (idempotente).
  async function ackPrecios(req, res) {
    if (req.method !== 'POST') { req.resume(); return json(res, 405, { error: 'Método no permitido' }, { Allow: 'POST' }); }
    const c = await instalacion(req, res); if (!c) return;
    const b = await leerJson(req, LIMITE_CHICO);
    return json(res, 200, await datos.ackCambios(c, b.resultados));
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
    const metodos = { '/api/login': 'POST', '/api/logout': 'POST', '/api/clave': 'POST', '/api/datos': 'GET', '/api/ver': 'GET', '/api/precio': 'POST' };
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
    // POST /api/precio { pid, precio, visto }: el dueño (con su sesión) pide cambiar un precio; queda pendiente hasta que la PC lo aplique.
    if (ruta === '/api/precio') {
      if (!c.activo || !(await sesionDe(req, c))) { req.resume(); return json(res, 401, { error: 'Sesión no válida' }); }
      if (await sumarIntento('precio|' + c.id, 60 * 1000) > PRECIOS_POR_MINUTO) { req.resume(); return json(res, 429, { error: 'Demasiados cambios de precio seguidos. Esperá un minuto.' }); }
      return json(res, 201, { cambio: await datos.crearCambio(c, await leerJson(req, LIMITE_CHICO), () => 'p_' + crypto.randomBytes(8).toString('hex')) });
    }
    // GET /api/ver y /api/datos (la sesión ya pudo validarse antes, con menos lecturas: req.spSesion)
    if (!c.activo || !(req.spSesion || await sesionDe(req, c))) return json(res, 401, { error: 'Sesión no válida' });
    if (ruta === '/api/ver') {
      // Solo un identificador opaco del último dato y si está desactualizado: nada del negocio, así que puede guardarse
      // 1 s en la CDN (la dirección incluye el comercio, no se mezclan). Los demás celulares comparten la misma consulta.
      const viejo = !c.ultimaSync || ahora() - Date.parse(c.ultimaSync) > FRESCURA_MS;
      return json(res, 200, { v: verDe(c), viejo }, { 'Cache-Control': CACHE_VER });
    }
    let foto = 'null';
    try { foto = await datos.leerFoto(c); }
    catch (e) { console.error(`[datos] foto ilegible de ${c.id}`); foto = 'null'; }
    const cambios = c.cmdv > 0 ? await datos.leerCambios(c) : [], t = ahora(), viejo = !c.ultimaSync || foto === 'null' || t - Date.parse(c.ultimaSync) > FRESCURA_MS;
    return json(res, 200, `{"negocio":${JSON.stringify({ nombre: c.nombre })},"foto":${foto},"ultimaSync":${JSON.stringify(foto === 'null' ? null : c.ultimaSync)},"ahora":${JSON.stringify(new Date(t).toISOString())},"desactualizado":${viejo},"ver":${JSON.stringify(verDe(c))},"cambios":${JSON.stringify(cambios)}}`);
  }
  // Sesión primero (GET sesión + MGET comercio/estado = 2 comandos): se evita buscar el comercio por su dirección (1 más).
  // Si algo no cuadra devuelve null y el pedido sigue por el camino de siempre, con los mismos errores.
  async function porSesion(req, sub) {
    const t = cookieSesion(req); if (!t || !sub) return null;
    const k = sha256(t), txt = await almacen.leer(K.ses(k)); if (!txt) return null;
    const s = JSON.parse(txt), c = s.vence > ahora() ? await porId(s.id) : null;
    return c && c.activo && c.sub === sub && (s.gen || 0) === (c.sesGen || 0) ? { c, x: { k, s } } : null;
  }

  // ---------- Enrutador ----------
  async function atender(req, res) {
    let u;
    try { u = new URL(req.url, 'http://x'); } catch { req.resume(); return json(res, 400, { error: 'Pedido inválido' }); }
    let ruta = u.pathname;
    if (ruta === '/salud') {
      // Sin consultar la base: usa la cuenta que ya lleva esta instancia. Pasado el 70 % del cupo del mes avisa (y el log del servidor también).
      req.resume(); const u = almacen.uso && almacen.uso();
      return json(res, 200, u && u.pct >= UMBRAL_AVISO_USO ? { ok: true, aviso: `La base de datos usó el ${u.pct} % de su cupo mensual de comandos`, uso: u } : { ok: true });
    }
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
    if (ruta === '/ingesta/ops') return ops(req, res);
    if (ruta === '/ingesta/pendientes') return pendientes(req, res);
    if (ruta === '/ingesta/ack') return ackPrecios(req, res);
    if (ruta === '/registro') return registro(req, res);
    if (ruta === '/clave-instalacion') return claveInstalacion(req, res);

    const sub = subDe(req);
    if (ruta === '/admin' || ruta.startsWith('/admin/')) {
      if (sub !== null) { req.resume(); return json(res, 404, { error: 'No existe' }); }   // nunca desde el subdominio de un comercio
      return admin(req, res, ruta);
    }
    const esApi = ruta === '/api' || ruta.startsWith('/api/');
    if (!esApi && ruta !== '/') { req.resume(); return json(res, 404, { error: 'No existe' }); }
    let c = null;
    if (esApi && req.method === 'GET' && (ruta === '/api/datos' || ruta === '/api/ver')) {
      if (ruta === '/api/ver' && !cookieSesion(req)) return json(res, 401, { error: 'Sesión no válida' });   // sin sesión no se gasta ningún comando
      // /api/ver recuerda 10 s la validación de la sesión (solo devuelve un identificador opaco): baja de 2 a 1 comando.
      // Una sesión cerrada puede seguir viendo esa versión hasta 10 s; /api/datos siempre la revalida.
      const mk = ruta === '/api/ver' ? sha256(cookieSesion(req)) + '|' + sub : '', m = mk && memoVer.get(mk);
      if (m && m.hasta > ahora()) { const [e, v] = await almacen.leerVarios([K.est(m.c.id), K.cmdv(m.c.id)]); c = conEstado(m.c, e ? JSON.parse(e) : {}, v); req.spSesion = m.x; }
      else {
        const r = await porSesion(req, sub); if (r) { c = r.c; req.spSesion = r.x; }
        if (r && mk) { if (memoVer.size > 500) memoVer.clear(); memoVer.set(mk, { c: r.c, x: r.x, hasta: ahora() + MEMO_VER_MS }); }
      }
    }
    if (!c) c = sub ? await porSub(sub) : null;
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
  const s = crear({ dataDir, dominioBase, adminToken, confiarProxy: process.env.CONFIAR_PROXY === '1', frescuraMs: (Number(process.env.FRESCURA_SEG) || 720) * 1000 });
  s.listen(port).then(p => console.log(`StockProject Nube escuchando en el puerto ${p} (dominio base: ${dominioBase || 'sin definir'})`))
    .catch(e => { console.error('No se pudo abrir el puerto ' + port + ': ' + e.message); process.exit(1); });
  for (const señal of ['SIGTERM', 'SIGINT']) process.on(señal, () => s.close().then(() => process.exit(0)));
}
