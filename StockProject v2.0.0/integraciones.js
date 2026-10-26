// Claves de API, webhooks firmados con reintentos y detección de eventos. No depende de Electron.
// Archivo propio (integraciones.json); las claves se guardan solo como hash: se muestran una vez al crearlas.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const EVENTOS = ['venta.creada', 'venta.anulada', 'stock.bajo', 'cliente.creado', 'producto.creado', 'pago.registrado', 'prueba'];
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const DEMORAS = [1000, 5000, 30000];

module.exports = function ({ file, fetchFn = (...a) => fetch(...a), ahora = () => Date.now(), esperar = (f, ms) => setTimeout(f, ms), maxFallos = 20 }) {
  const rd = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { return { tokens: [], hooks: [], nid: 1 } } };
  const wr = d => { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = file + '.tmp'; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, file); };
  let prev = null; const log = [];

  // ---- claves de API ----
  function crearToken(nombre, scope) {
    nombre = String(nombre || '').trim().slice(0, 60); if (!nombre) return { ok: false, err: 'Poné un nombre para reconocer la clave' };
    if (!['lectura', 'escritura'].includes(scope)) return { ok: false, err: 'Permiso inválido' };
    const d = rd(), token = 'spk_' + crypto.randomBytes(24).toString('hex');
    d.tokens.push({ id: d.nid++, nombre, scope, hash: sha(token), pref: token.slice(0, 8), creado: new Date(ahora()).toISOString(), ultimo: null }); wr(d);
    return { ok: true, token };
  }
  const listarTokens = () => rd().tokens.map(({ hash, ...t }) => t);
  function revocarToken(id) { const d = rd(); d.tokens = d.tokens.filter(t => t.id !== id); wr(d); return { ok: true }; }
  function verificar(cabecera) {
    const m = /^Bearer\s+(spk_[0-9a-f]{48})$/.exec(String(cabecera || '')); if (!m) return null;
    const h = Buffer.from(sha(m[1]), 'hex'), d = rd(); let hallado = null;
    d.tokens.forEach(t => { const x = Buffer.from(t.hash, 'hex'); if (x.length === h.length && crypto.timingSafeEqual(x, h)) hallado = t; });
    if (hallado && (!hallado.ultimo || ahora() - Date.parse(hallado.ultimo) > 6e4)) { hallado.ultimo = new Date(ahora()).toISOString(); wr(d); }
    return hallado ? { id: hallado.id, nombre: hallado.nombre, scope: hallado.scope } : null;
  }

  // ---- webhooks ----
  const urlOk = u => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) } catch (e) { return false } };
  function crearHook({ url, eventos }) {
    if (!urlOk(url)) return { ok: false, err: 'La dirección tiene que empezar con http:// o https://' };
    const ev = (eventos || []).filter(e => EVENTOS.includes(e) && e !== 'prueba'); if (!ev.length) return { ok: false, err: 'Elegí al menos un evento' };
    const d = rd(), secreto = crypto.randomBytes(20).toString('hex');
    d.hooks.push({ id: d.nid++, url, eventos: ev, secreto, activo: true, fallos: 0, estado: '', ultimo: null }); wr(d); return { ok: true, secreto };
  }
  const listarHooks = () => rd().hooks.map(({ secreto, ...h }) => ({ ...h, secreto: secreto.slice(0, 4) + '…' }));
  function borrarHook(id) { const d = rd(); d.hooks = d.hooks.filter(h => h.id !== id); wr(d); return { ok: true }; }
  function activarHook(id) { const d = rd(), h = d.hooks.find(x => x.id === id); if (h) { h.activo = true; h.fallos = 0; wr(d); } return { ok: !!h }; }
  const firma = (secreto, cuerpo) => 'sha256=' + crypto.createHmac('sha256', secreto).update(cuerpo).digest('hex');
  function marcar(id, ok, estado) {
    const d = rd(), h = d.hooks.find(x => x.id === id); if (!h) return;
    h.estado = estado; h.ultimo = new Date(ahora()).toISOString(); h.fallos = ok ? 0 : h.fallos + 1; if (h.fallos >= maxFallos) h.activo = false; wr(d);
  }
  async function enviar(h, cuerpo, intento = 0) {
    let ok = false, estado = '';
    try {
      const r = await fetchFn(h.url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json', 'User-Agent': 'StockProject-Webhook', 'X-StockProject-Event': cuerpo.evento, 'X-StockProject-Signature': firma(h.secreto, cuerpo.texto) }, body: cuerpo.texto });
      ok = r.status >= 200 && r.status < 300; estado = 'HTTP ' + r.status;
    } catch (e) { estado = 'Sin respuesta (' + String(e.message || e).slice(0, 60) + ')'; }
    log.push({ hook: h.id, evento: cuerpo.evento, ok, estado }); if (log.length > 100) log.shift();
    if (ok || intento >= DEMORAS.length) { marcar(h.id, ok, estado + (ok || !intento ? '' : '')); return ok; }
    marcar(h.id, false, estado + ' · reintentando'); esperar(() => enviar(h, cuerpo, intento + 1), DEMORAS[intento]); return false;
  }
  function emitir(evento, datos) {
    const hs = rd().hooks.filter(h => h.activo && (evento === 'prueba' || h.eventos.includes(evento)));
    const cuerpo = { evento, texto: JSON.stringify({ id: crypto.randomUUID(), evento, fecha: new Date(ahora()).toISOString(), datos }) };
    return Promise.all(hs.map(h => enviar(h, cuerpo)));
  }
  const probar = id => { const h = rd().hooks.find(x => x.id === id); return h ? enviar(h, { evento: 'prueba', texto: JSON.stringify({ id: crypto.randomUUID(), evento: 'prueba', fecha: new Date(ahora()).toISOString(), datos: { mensaje: 'Evento de prueba de StockProject' } }) }).then(ok => ({ ok })) : Promise.resolve({ ok: false }); };

  // ---- eventos a partir de los cambios entre dos versiones de los datos ----
  const stockDe = p => (p.lots || []).reduce((a, l) => a + l.qty, 0);
  function diferencias(a, b) {
    const out = [], ids = arr => new Set((arr || []).map(x => x.id)), nuevos = (k) => { const s = ids(a[k]); return (b[k] || []).filter(x => !s.has(x.id)) };
    nuevos('sales').forEach(s => { if (!s.void) out.push(['venta.creada', { id: s.id, fecha: s.date, total: s.total, medio_pago: s.pay, cliente: s.cname || null, items: s.items.map(i => ({ producto: i.name, cantidad: i.qty, precio: i.price })) }]); });
    const antes = new Map((a.sales || []).map(s => [s.id, s])); (b.sales || []).forEach(s => { const p = antes.get(s.id); if (p && s.void && !p.void) out.push(['venta.anulada', { id: s.id, total: s.total }]); });
    nuevos('clients').forEach(c => out.push(['cliente.creado', { id: c.id, nombre: c.name, telefono: c.phone || '' }]));
    nuevos('prods').forEach(p => out.push(['producto.creado', { id: p.id, codigo: p.code || '', nombre: p.name, precio: p.price }]));
    nuevos('pays').forEach(p => out.push(['pago.registrado', { id: p.id, cliente_id: p.cid, monto: p.amount, medio: p.method }]));
    const pa = new Map((a.prods || []).map(p => [p.id, p])); (b.prods || []).forEach(p => { const o = pa.get(p.id); if (o && p.min > 0 && stockDe(p) <= p.min && stockDe(o) > o.min) out.push(['stock.bajo', { id: p.id, codigo: p.code || '', nombre: p.name, stock: stockDe(p), minimo: p.min }]); });
    return out;
  }
  const hayActivos = () => rd().hooks.some(h => h.activo);
  // Se llama con cada guardado exitoso. Si no hay webhooks activos no hace nada (no cuesta).
  function alGuardar(texto) {
    if (!hayActivos()) { prev = null; return; }
    let b; try { b = JSON.parse(texto) } catch (e) { return; }
    if (prev) diferencias(prev, b).forEach(([e, d]) => emitir(e, d));
    prev = b;
  }
  const iniciar = texto => { if (hayActivos()) { try { prev = JSON.parse(texto) } catch (e) { prev = null } } };
  return { EVENTOS, crearToken, listarTokens, revocarToken, verificar, crearHook, listarHooks, borrarHook, activarHook, probar, emitir, diferencias, alGuardar, iniciar, historial: () => log.slice().reverse(), firma };
};
module.exports.EVENTOS = EVENTOS;
