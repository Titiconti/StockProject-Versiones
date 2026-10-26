// Servidor de acceso remoto: sirve la misma aplicación y los mismos datos a celulares u otras PC.
// No depende de Electron: lo usa el programa de escritorio y también "node servidor-cli.js".
const http = require('http'), fs = require('fs'), crypto = require('crypto'), os = require('os');

const DIA = 864e5;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function loginHtml() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StockProject</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f6f8;color:#1b1f27;font:16px system-ui,sans-serif}
@media(prefers-color-scheme:dark){body{background:#0f1218;color:#e8eaf0}form{background:#181c25!important;border-color:#2a303c!important}input{background:#0f1218!important;color:#e8eaf0!important;border-color:#2a303c!important}}
form{background:#fff;border:1px solid #e3e6ec;border-radius:14px;padding:26px;width:min(340px,90vw)}h1{margin:0 0 4px;font-size:22px;color:#2563eb}p{margin:0 0 16px;color:#6b7280;font-size:14px}
input{width:100%;box-sizing:border-box;padding:12px;font-size:20px;letter-spacing:4px;text-align:center;border:1px solid #e3e6ec;border-radius:10px;margin-bottom:12px}
button{width:100%;padding:12px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:16px;font-weight:700;cursor:pointer}#m{color:#dc2626;min-height:20px;font-size:14px;margin-top:10px;text-align:center}
</style></head><body><form id="f"><h1>📦 StockProject</h1><p>Ingresá la clave de acceso</p>
<input id="p" type="password" autocomplete="current-password" autofocus placeholder="••••••"><button>Entrar</button><div id="m"></div></form>
<script>f.onsubmit=async e=>{e.preventDefault();m.textContent='';try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:p.value})});
if(r.ok)location.href='/';else m.textContent=r.status===429?'Demasiados intentos. Esperá un minuto.':'Clave incorrecta'}catch(x){m.textContent='No se pudo conectar'}}</script></body></html>`;
}

function ips() {
  const r = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) r.push(i.address);
  return r;
}

function crearServidor({ store, indexPath, defaults = {}, auth }) {
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

  const srv = http.createServer(async (req, res) => {
    const send = (code, data, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
      res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
    };
    try {
      const u = new URL(req.url, 'http://x'), { pin, secret } = auth();
      if (u.pathname === '/login' && req.method === 'GET') return send(200, loginHtml(), 'text/html; charset=utf-8');
      if (u.pathname === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress, ahora = Date.now(), a = intentos.get(ip) || { n: 0, t: ahora };
        if (ahora - a.t > 60e3) { a.n = 0; a.t = ahora; }
        if (a.n >= 5) return send(429, { error: 'demasiados intentos' });
        let b = {}; try { b = JSON.parse(await leer(req, 1e4)) } catch (e) {}
        if (b.pin && igual(b.pin, pin)) {
          intentos.delete(ip);
          const exp = ahora + 30 * DIA;
          return send(200, { ok: true }, undefined, { 'Set-Cookie': `sp_token=${firmar(secret, exp)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}` });
        }
        a.n++; intentos.set(ip, a);
        return send(401, { error: 'clave incorrecta' });
      }
      if (u.pathname === '/api/logout') return send(200, { ok: true }, undefined, { 'Set-Cookie': 'sp_token=; HttpOnly; Path=/; Max-Age=0' });
      if (!valido(secret, cookies(req).sp_token)) {
        if (u.pathname.startsWith('/api/')) return send(401, { error: 'no autorizado' });
        res.writeHead(302, { Location: '/login' }); return res.end();
      }
      if ((u.pathname === '/' || u.pathname === '/index.html') && req.method === 'GET') {
        const raw = fs.readFileSync(indexPath, 'utf8'), s = store.load();
        let data = null; try { data = s ? JSON.parse(s) : null } catch (e) {}
        const boot = JSON.stringify({ rev: store.rev(), data, defaults: { demo: !!defaults.demo, shop: defaults.shop } })
          .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        return send(200, raw.replace('<head>', () => '<head><script>window.SP_BOOT=' + boot + ';</script>'), 'text/html; charset=utf-8');
      }
      if (u.pathname === '/api/rev' && req.method === 'GET') return send(200, { rev: store.rev() });
      if (u.pathname === '/api/db' && req.method === 'GET') { const s = store.load(); return send(200, s || 'null'); }
      if (u.pathname === '/api/db' && req.method === 'PUT') {
        const base = parseInt(u.searchParams.get('base'), 10);
        if (Number.isNaN(base)) return send(400, { error: 'falta la versión base' });
        const r = store.put(await leer(req), base);
        return send(r.ok ? 200 : (r.conflict ? 409 : 400), r);
      }
      if (u.pathname === '/api/backup' && req.method === 'GET') {
        const f = 'StockProject-copia-' + new Date().toISOString().slice(0, 10) + '.json';
        return send(200, store.snapshot() || '{}', 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="${f}"` });
      }
      return send(404, { error: 'no encontrado' });
    } catch (e) {
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
  return { srv, listen, close: () => { try { srv.close(); srv.closeAllConnections && srv.closeAllConnections(); } catch (e) {} } };
}

// Administra el servidor según la configuración guardada (activado, puerto, clave).
function gestor({ store, indexPath, defaults = {} }) {
  let ctl = null, port = 0, error = '';
  const conf = () => {
    const r = store.getConfig().remote || {};
    const c = {
      enabled: r.enabled !== undefined ? !!r.enabled : defaults.accesoRemoto !== false,
      port: r.port || defaults.puertoRemoto || 3000,
      pin: r.pin || defaults.claveRemota || String(100000 + crypto.randomInt(900000)),
      secret: r.secret || crypto.randomBytes(24).toString('hex')
    };
    if (r.pin !== c.pin || r.secret !== c.secret || r.enabled === undefined) store.setConfig({ remote: { ...r, ...c } });
    return c;
  };
  const info = () => { const c = conf(); return { enabled: c.enabled, running: !!ctl, port: ctl ? port : c.port, pin: c.pin, urls: ctl ? ips().map(ip => `http://${ip}:${port}`) : [], error }; };
  function stop() { if (ctl) { ctl.close(); ctl = null; } }
  async function start() {
    stop(); error = '';
    const c = conf();
    if (!c.enabled) return info();
    ctl = crearServidor({ store, indexPath, defaults, auth: () => { const x = conf(); return { pin: x.pin, secret: x.secret }; } });
    try { port = await ctl.listen(c.port); } catch (e) { error = 'No se pudo abrir el puerto ' + c.port + ': ' + e.message; ctl = null; }
    return info();
  }
  async function setConfig({ enabled, pin, port: p }) {
    const r = store.getConfig().remote || {}, c = conf(), n = { ...r, ...c };
    if (enabled !== undefined) n.enabled = !!enabled;
    if (p) n.port = +p;
    if (pin !== undefined) {
      if (!/^[A-Za-z0-9]{4,12}$/.test(String(pin))) return { ...info(), error: 'La clave debe tener entre 4 y 12 letras o números' };
      n.pin = String(pin); n.secret = crypto.randomBytes(24).toString('hex');   // cambiar la clave cierra las sesiones abiertas
    }
    store.setConfig({ remote: n });
    return start();
  }
  return { start, stop, info, setConfig };
}

module.exports = { crearServidor, gestor, ips, esc };
