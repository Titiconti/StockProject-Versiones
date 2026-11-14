// Servidor de acceso remoto: sirve la misma aplicación y los mismos datos a celulares u otras PC.
// No depende de Electron: lo usa el programa de escritorio y también "node servidor-cli.js".
const http = require('http'), https = require('https'), path = require('path'), fs = require('fs'), crypto = require('crypto'), os = require('os');

const DIA = 864e5;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function loginHtml(conUsuarios) {
  const campos = conUsuarios
    ? '<p>Ingresá con tu usuario</p><input id="u" autocomplete="username" autofocus placeholder="Usuario" style="font-size:17px;letter-spacing:0"><input id="p" type="password" autocomplete="current-password" placeholder="Contraseña" style="font-size:17px;letter-spacing:0">'
    : '<p>Ingresá la clave de acceso</p><input id="p" type="password" autocomplete="current-password" autofocus placeholder="••••••">';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StockProject</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f6f8;color:#1b1f27;font:16px system-ui,sans-serif}
@media(prefers-color-scheme:dark){body{background:#0f1218;color:#e8eaf0}form{background:#181c25!important;border-color:#2a303c!important}input{background:#0f1218!important;color:#e8eaf0!important;border-color:#2a303c!important}}
form{background:#fff;border:1px solid #e3e6ec;border-radius:14px;padding:26px;width:min(340px,90vw)}h1{margin:0 0 4px;font-size:22px;color:#2563eb}p{margin:0 0 16px;color:#6b7280;font-size:14px}
input{width:100%;box-sizing:border-box;padding:12px;font-size:20px;letter-spacing:4px;text-align:center;border:1px solid #e3e6ec;border-radius:10px;margin-bottom:12px}
button{width:100%;padding:12px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:16px;font-weight:700;cursor:pointer}#m{color:#dc2626;min-height:20px;font-size:14px;margin-top:10px;text-align:center}
</style></head><body><form id="f"><h1>📦 StockProject</h1>${campos}<button>Entrar</button><div id="m"></div></form>
<script>f.onsubmit=async e=>{e.preventDefault();m.textContent='';try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:p.value,user:window.u?u.value:undefined,pass:p.value})});
if(r.ok)location.href='/';else m.textContent=r.status===429?'Demasiados intentos. Esperá unos minutos.':window.u?'Usuario o contraseña incorrectos':'Clave incorrecta'}catch(x){m.textContent='No se pudo conectar'}}</script></body></html>`;
}

// Certificado propio (autofirmado) para HTTPS en la red local. Se genera una vez y se guarda junto a la configuración.
function certificado(dir) {
  const kf = path.join(dir, 'https-clave.pem'), cf = path.join(dir, 'https-cert.pem');
  try { const key = fs.readFileSync(kf, 'utf8'), cert = fs.readFileSync(cf, 'utf8'); if (key && cert) return { key, cert }; } catch (e) {}
  const alt = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...ips().map(ip => ({ type: 7, ip }))];
  const p = require('selfsigned').generate([{ name: 'commonName', value: 'StockProject' }], { days: 3650, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames: alt }] });
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(kf, p.private, { mode: 0o600 }); fs.writeFileSync(cf, p.cert);
  return { key: p.private, cert: p.cert };
}

function ips() {
  const r = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) r.push(i.address);
  return r;
}

function crearServidor({ store, indexPath, defaults = {}, auth, usuarios, tls, integraciones }) {
  const apiMod = require('./api');
  const SEC = tls ? '; Secure' : '';
  const conU = () => !!(usuarios && usuarios.habilitado());
  const intentos = new Map();
  const firmar = (secret, exp) => exp + '.' + crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
  const valido = (secret, tok) => {
    if (!tok) return false;
    const [exp, mac] = String(tok).split('.');
    if (!exp || !mac || !(+exp > Date.now())) return false;
    const a = Buffer.from(mac), b = Buffer.from(firmar(secret, exp).split('.')[1]);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const igual = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, v.join('=')]));
  const leer = (req, max = 100e6) => new Promise((res, rej) => {
    const partes = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { rej(new Error('demasiado grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => res(Buffer.concat(partes).toString('utf8')));
    req.on('error', rej);
  });

  const stats = { peticiones: 0, errores: 0, api: 0, desde: Date.now() };
  async function manejarApi(req, u, send) {
    stats.api++;
    const ruta = u.pathname.slice(7);
    if (ruta === '/docs') return send(200, apiMod.docsHtml(), 'text/html; charset=utf-8');
    if (ruta === '/openapi.json') return send(200, apiMod.OPENAPI);
    if (!integraciones) return send(404, { error: 'no disponible' });
    const ip = req.socket.remoteAddress, t0 = Date.now(), k = 'api' + ip, a = intentos.get(k) || { n: 0, t: t0 };
    if (t0 - a.t > 60e3) { a.n = 0; a.t = t0; } if (a.n >= 20) return send(429, { error: 'demasiados intentos' });
    const tk = integraciones.verificar(req.headers.authorization);
    if (!tk) { a.n++; intentos.set(k, a); return send(401, { error: 'clave inválida' }); }
    const datos = () => { try { return JSON.parse(store.snapshot() || '{}') } catch (e) { return {} } };
    if (req.method === 'GET') { const r = apiMod.consultar(datos(), ruta, u.searchParams); return r == null ? send(404, { error: 'no encontrado' }) : send(200, r); }
    if (req.method === 'POST' && ['/productos', '/clientes', '/ventas'].includes(ruta)) {
      if (tk.scope !== 'escritura') return send(403, { error: 'esta clave es de solo lectura' });
      let b; try { b = JSON.parse(await leer(req, 1e6)) } catch (e) { return send(400, { error: 'JSON inválido' }); }
      const f = ruta === '/productos' ? apiMod.productoUpsert : ruta === '/clientes' ? apiMod.clienteUpsert : apiMod.ventaCrear;
      for (let i = 0; i < 4; i++) {
        const txt = store.snapshot(); if (!txt) return send(500, { error: 'sin datos' });
        const db = JSON.parse(txt), rev = store.rev(), r = f(db, b);
        if (!r.ok) return send(r.codigo || 400, { error: r.error });
        const w = store.put(JSON.stringify(db), rev);
        if (w.ok) { if (usuarios) usuarios.audit({ id: null, user: 'api:' + tk.nombre }, 'api' + ruta, ''); return send(201, r); }
        if (!w.conflict) return send(w.err ? 422 : 500, { error: w.err || 'no se pudo guardar' });
      }
      return send(503, { error: 'los datos cambiaron mientras se guardaba; reintentá' });
    }
    return send(404, { error: 'no encontrado' });
  }

  const srv = (tls ? https.createServer.bind(https, tls) : http.createServer)(async (req, res) => {
    const send = (code, data, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(code, { ...(tls ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}), 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
      res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
    };
    stats.peticiones++;
    try {
      const u = new URL(req.url, 'http://x'), { pin, secret } = auth();
      if (u.pathname === '/manifest.webmanifest') return send(200, { name: 'StockProject', short_name: 'StockProject', start_url: '/', display: 'standalone', background_color: '#f5f6f8', theme_color: '#2563eb', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }, 'application/manifest+json');
      if (u.pathname === '/icon.svg') return send(200, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#2563eb"/><g fill="none" stroke="#fff" stroke-width="28" stroke-linejoin="round"><path d="M96 176l160-80 160 80v160l-160 80-160-80z"/><path d="M96 176l160 80 160-80M256 256v160"/></g></svg>', 'image/svg+xml');
      if (u.pathname.startsWith('/api/v1/')) return await manejarApi(req, u, send);
      if (u.pathname === '/login' && req.method === 'GET') return send(200, loginHtml(conU()), 'text/html; charset=utf-8');
      if (u.pathname === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress, ahora = Date.now(), a = intentos.get(ip) || { n: 0, t: ahora };
        if (ahora - a.t > 60e3) { a.n = 0; a.t = ahora; }
        if (a.n >= 5) return send(429, { error: 'demasiados intentos' });
        let b = {}; try { b = JSON.parse(await leer(req, 1e4)) } catch (e) {}
        if (conU()) {
          const r = usuarios.login(b.user, b.pass, String(req.headers['user-agent'] || 'remoto').slice(0, 60) + ' @' + ip);
          if (r.ok) { intentos.delete(ip); return send(200, { ok: true }, undefined, { 'Set-Cookie': `sp_token=${r.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${SEC}` }); }
          a.n++; intentos.set(ip, a);
          return send(r.bloqueado ? 429 : 401, { error: r.err });
        }
        if (b.pin && igual(b.pin, pin)) {
          intentos.delete(ip);
          const exp = ahora + 30 * DIA;
          return send(200, { ok: true }, undefined, { 'Set-Cookie': `sp_token=${firmar(secret, exp)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${SEC}` });
        }
        a.n++; intentos.set(ip, a);
        return send(401, { error: 'clave incorrecta' });
      }
      if (u.pathname === '/api/logout') { if (conU()) usuarios.logout(cookies(req).sp_token); return send(200, { ok: true }, undefined, { 'Set-Cookie': 'sp_token=; HttpOnly; Path=/; Max-Age=0' + SEC }); }
      const tk = cookies(req).sp_token, yo = conU() ? usuarios.sesion(tk) : null;
      if (conU() ? !yo : !valido(secret, tk)) {
        if (u.pathname.startsWith('/api/')) return send(401, { error: 'no autorizado' });
        res.writeHead(302, { Location: '/login' }); return res.end();
      }
      if ((u.pathname === '/' || u.pathname === '/index.html') && req.method === 'GET') {
        const raw = fs.readFileSync(indexPath, 'utf8'), s = store.load();
        let data = null; try { data = s ? JSON.parse(s) : null } catch (e) {}
        const boot = JSON.stringify({ rev: store.rev(), data, defaults: { demo: !!defaults.demo, shop: defaults.shop }, auth: usuarios ? usuarios.llamar(tk, 'estado') : null })
          .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        return send(200, raw.replace('<head>', () => '<head><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg"><meta name="theme-color" content="#2563eb"><script>window.SP_BOOT=' + boot + ';</script>'), 'text/html; charset=utf-8');
      }
      if (u.pathname === '/api/rev' && req.method === 'GET') return send(200, { rev: store.rev() });
      if (u.pathname === '/api/db' && req.method === 'GET') { const s = store.load(); return send(200, s || 'null'); }
      if (u.pathname === '/api/db' && req.method === 'PUT') {
        if (conU() && !usuarios.puedeEscribir(yo)) return send(403, { error: 'Tu usuario es de solo consulta' });
        const base = parseInt(u.searchParams.get('base'), 10);
        if (Number.isNaN(base)) return send(400, { error: 'falta la versión base' });
        const r = store.put(await leer(req), base);
        return send(r.ok ? 200 : (r.conflict ? 409 : 400), r);
      }
      if (u.pathname === '/api/backup' && req.method === 'GET') {
        if (conU() && !usuarios.tiene(yo, 'respaldo', 'ver')) return send(403, { error: 'Sin permiso' });
        if (conU()) usuarios.audit(yo, 'respaldo.descargar');
        const f = 'StockProject-copia-' + new Date().toISOString().slice(0, 10) + '.json';
        return send(200, store.snapshot() || '{}', 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="${f}"` });
      }
      if (u.pathname.startsWith('/api/auth/') && req.method === 'POST' && conU()) {
        const n = decodeURIComponent(u.pathname.slice(10));
        if (!usuarios.NOMBRES.includes(n)) return send(404, { error: 'no encontrado' });
        let b = {}; try { b = JSON.parse(await leer(req, 1e5)) } catch (e) {}
        return send(200, usuarios.llamar(tk, n, Array.isArray(b.args) ? b.args : []));
      }
      return send(404, { error: 'no encontrado' });
    } catch (e) {
      stats.errores++;
      try { send(500, { error: String(e.message || e) }); } catch (x) {}
    }
  });

  function listen(port) {
    return new Promise((resolve, reject) => {
      const probar = (p, restan) => {
        srv.once('error', e => { if (e.code === 'EADDRINUSE' && port !== 0 && restan > 0) probar(p + 1, restan - 1); else reject(e); });
        srv.listen(p, '0.0.0.0', () => { srv.removeAllListeners('error'); resolve(srv.address().port); });
      };
      probar(port, 10);
    });
  }
  return { srv, listen, stats: () => ({ ...stats }), close: () => { try { srv.close(); srv.closeAllConnections && srv.closeAllConnections(); } catch (e) {} } };
}

// Administra el servidor según la configuración guardada (activado, puerto, clave).
function gestor({ store, indexPath, defaults = {}, usuarios, certDir, integraciones }) {
  let ctl = null, port = 0, error = '', esHttps = false;
  const conf = () => {
    const r = store.getConfig().remote || {};
    const c = {
      enabled: r.enabled !== undefined ? !!r.enabled : defaults.accesoRemoto !== false,
      port: r.port || defaults.puertoRemoto || 3000,
      https: r.https !== undefined ? !!r.https : !!defaults.httpsRemoto,
      pin: r.pin || defaults.claveRemota || String(100000 + crypto.randomInt(900000)),
      secret: r.secret || crypto.randomBytes(24).toString('hex')
    };
    if (r.pin !== c.pin || r.secret !== c.secret || r.enabled === undefined) store.setConfig({ remote: { ...r, ...c } });
    return c;
  };
  const info = () => { const c = conf(); return { enabled: c.enabled, running: !!ctl, port: ctl ? port : c.port, pin: c.pin, https: c.https, stats: ctl ? ctl.stats() : null, urls: ctl ? ips().map(ip => `${esHttps ? 'https' : 'http'}://${ip}:${port}`) : [], error }; };
  function stop() { if (ctl) { ctl.close(); ctl = null; } }
  async function start() {
    stop(); error = '';
    const c = conf();
    if (!c.enabled) return info();
    let tls = null; esHttps = false;
    if (c.https && certDir) { try { tls = certificado(certDir); esHttps = true; } catch (e) { error = 'No se pudo preparar HTTPS: ' + e.message; } }
    ctl = crearServidor({ store, indexPath, defaults, usuarios, tls, integraciones, auth: () => { const x = conf(); return { pin: x.pin, secret: x.secret }; } });
    try { port = await ctl.listen(c.port); } catch (e) { error = 'No se pudo abrir el puerto ' + c.port + ': ' + e.message; ctl = null; }
    return info();
  }
  async function setConfig({ enabled, pin, port: p, https: h }) {
    const r = store.getConfig().remote || {}, c = conf(), n = { ...r, ...c };
    if (enabled !== undefined) n.enabled = !!enabled;
    if (p) n.port = +p;
    if (h !== undefined) n.https = !!h;
    if (pin !== undefined) {
      if (!/^[A-Za-z0-9]{4,12}$/.test(String(pin))) return { ...info(), error: 'La clave debe tener entre 4 y 12 letras o números' };
      n.pin = String(pin); n.secret = crypto.randomBytes(24).toString('hex');   // cambiar la clave cierra las sesiones abiertas
    }
    store.setConfig({ remote: n });
    return start();
  }
  return { start, stop, info, setConfig };
}

module.exports = { crearServidor, gestor, ips, esc, certificado };
