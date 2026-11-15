// Panel para el celular desde cualquier lugar: esta PC ENVÍA al servidor central una "foto" de solo lectura
// (ventas, stock, cajas, saldos). El servidor nunca se conecta a esta PC ni puede modificar nada: no hay camino de vuelta.
// Si no hay Internet o el servidor no responde, el programa sigue funcionando igual y se reintenta solo.
// Nunca se envían contraseñas, claves, usuarios del sistema ni la configuración; de los clientes, solo nombre y saldo.
'use strict';
const r2 = n => Math.round((+n || 0) * 100) / 100;
const dia = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

// Arma la foto a partir de los datos. Es una función pura: se puede probar sin red.
function proyeccion(db, ahora = Date.now()) {
  db = db || {}; const hoy = dia(ahora), desde = dia(ahora - 90 * 864e5), en30 = dia(ahora + 30 * 864e5), cfg = db.cfg || {}, enc = cfg.encuesta || {};
  const prods = db.prods || [], peso = p => p.unidad === 'kg', cant = (p, q) => peso(p) ? r2(q / 1000) : q;
  const vend = p => (p.lots || []).filter(l => !l.exp || l.exp >= hoy).reduce((a, l) => a + l.qty, 0), tot = p => (p.lots || []).reduce((a, l) => a + l.qty, 0);
  const ventas = (db.sales || []).filter(s => dia(s.date) >= desde).slice(-3000).map(s => ({ id: s.id, fecha: s.date, total: r2(s.total), pago: s.pay, cliente: s.cname || null, usuario: s.user || null, anulada: !!s.void,
    items: (s.items || []).map(i => ({ n: i.name, q: i.qty, u: i.u, p: r2(i.price), t: r2(i.tot != null ? i.tot : i.qty * i.price) })) }));
  const stock = prods.filter(p => p.control !== 'variantes').map(p => { const v = vend(p), t = tot(p), ex = (p.lots || []).filter(l => l.exp && l.exp >= hoy && l.qty > 0).map(l => l.exp).sort()[0] || '';
    return { n: p.name, cod: p.code || '', cat: p.cat || '', precio: r2(p.price), disp: cant(p, v), u: peso(p) ? 'kg' : undefined, min: p.min || 0, vence: ex, estado: v <= 0 ? (t > 0 ? 'vencido' : 'sin') : p.min && v <= (peso(p) ? p.min * 1000 : p.min) ? 'bajo' : 'ok' }; });
  const cajas = (db.cajas || []).slice(-30).map(c => { const k = c.cierre && c.tot ? c.tot : calcCaja(db, c); return { usuario: c.user, caja: c.caja, abre: c.abre, cierre: c.cierre || null, ini: r2(c.ini), esperado: r2(k.esperado), contado: c.cierre ? r2(c.contado) : null, dif: c.cierre ? r2(c.dif) : null, vendido: r2(k.vendido), porMedio: k.porMedio || {} }; });
  const saldo = new Map(), sum = (id, n) => saldo.set(id, (saldo.get(id) || 0) + n);
  (db.sales || []).forEach(s => { if (s.cid != null && !s.void && s.pay === 'Cuenta corriente') sum(s.cid, s.total); });
  (db.cargos || []).forEach(x => sum(x.cid, x.amount)); (db.pays || []).forEach(p => sum(p.cid, -p.amount));
  const clientes = (db.clients || []).map(c => ({ n: c.name, saldo: r2(saldo.get(c.id) || 0) })).filter(c => Math.abs(c.saldo) >= 0.005);
  const bajas = (db.desv || []).filter(v => !v.void && dia(v.date) >= desde).slice(-300).map(v => ({ fecha: v.date, motivo: v.reason || '', detalle: (v.items || []).map(i => i.qty + ' x ' + i.name).join(', '), costo: r2((v.items || []).reduce((a, i) => a + i.qty * (i.cost || 0), 0)), usuario: v.user || null }));
  const vencimientos = []; prods.forEach(p => (p.lots || []).forEach(l => { if (l.exp && l.qty > 0 && l.exp <= en30) vencimientos.push({ n: p.name, lote: l.n, cant: cant(p, l.qty), vence: l.exp, estado: l.exp < hoy ? 'vencido' : 'porvencer' }); }));
  return { v: 1, generado: new Date(ahora).toISOString(), negocio: { nombre: (db.shop && db.shop.n) || 'Mi negocio', moneda: cfg.moneda || enc.mon || 'ARS', loc: cfg.loc || enc.loc || 'es-AR' }, ventas, stock, cajas, clientes, bajas, vencimientos };
}
function calcCaja(db, c) {
  const S = (db.sales || []).filter(s => s.caja === c.id && !s.void), P = (db.pays || []).filter(p => p.caja === c.id), M = c.movs || [], porMedio = {};
  S.forEach(s => { porMedio[s.pay] = r2((porMedio[s.pay] || 0) + s.total); });
  const ef = (porMedio.Efectivo || 0) + P.filter(p => p.method === 'Efectivo').reduce((a, p) => a + p.amount, 0) + M.reduce((a, m) => a + (m.t === 'ingreso' ? m.monto : -m.monto), 0);
  return { vendido: S.reduce((a, s) => a + s.total, 0), porMedio, esperado: c.ini + ef };
}

// leer(): texto JSON actual · getCfg()/setCfg(patch): configuración local · proteger/desproteger: cifrado del sistema para la clave.
function crear({ leer, getCfg, setCfg, enviar = (u, o) => fetch(u, o), ahora = () => Date.now(), proteger = s => s, desproteger = s => s, cada = 30000, programar = setInterval, cancelar = clearInterval }) {
  let timer = null, ocupado = false, est = { ultima: null, error: '', intento: null }, ultHash = '', ultEnvio = 0;
  const conf = () => (getCfg().nube || {});
  const token = () => { try { return conf().token ? desproteger(conf().token) : ''; } catch (e) { return ''; } };
  const urlOk = u => { try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname)); } catch (e) { return false; } };
  const estado = () => { const c = conf(); return { configurado: !!(c.url && c.token), activo: !!c.activo, url: c.url || '', panel: c.panel || '', ultima: est.ultima || c.ultima || null, error: est.error, intento: est.intento }; };
  function configurar({ url, token: t, panel }) {
    url = String(url || '').trim().replace(/\/+$/, ''); t = String(t || '').trim();
    if (!urlOk(url)) return { ok: false, err: 'La dirección del servidor tiene que empezar con https://' };
    if (!/^spn_[0-9a-f]{48}$/.test(t)) return { ok: false, err: 'La clave de instalación no es válida (empieza con spn_)' };
    setCfg({ nube: { ...conf(), url, token: proteger(t), panel: String(panel || '').trim().slice(0, 200), activo: true } }); est = { ultima: null, error: '', intento: null }; ultHash = '';
    return { ok: true };
  }
  function activar(on) { if (on && !estado().configurado) return { ok: false, err: 'Primero cargá la dirección y la clave' }; setCfg({ nube: { ...conf(), activo: !!on } }); if (on) iniciar(); else detener(); return { ok: true }; }
  function quitar() { detener(); setCfg({ nube: {} }); est = { ultima: null, error: '', intento: null }; return { ok: true }; }
  async function sincronizar(forzar) {
    const c = conf(), t = token(); if (!c.activo || !c.url || !t || ocupado) return estado();
    ocupado = true; est.intento = new Date(ahora()).toISOString();
    try {
      let db; try { db = JSON.parse(leer() || 'null'); } catch (e) { db = null; }
      if (!db) { est.error = 'No se pudieron leer los datos locales'; return estado(); }
      const foto = proyeccion(db, ahora()), h = JSON.stringify({ ...foto, generado: 0 });
      // Sin cambios se reenvía igual cada minuto: así el panel sabe que el comercio sigue conectado.
      if (!forzar && h === ultHash && ahora() - ultEnvio < 60000) return estado();
      const seq = Math.max((c.seq || 0) + 1, ahora());
      const r = await enviar(c.url + '/ingesta', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ seq, foto }) });
      if (r.status === 401) est.error = 'El servidor no reconoce la clave de esta instalación. Pedí una nueva a soporte.';
      else if (r.status === 413) est.error = 'Hay demasiados datos para enviar de una vez.';
      else if (!r.ok) est.error = 'El servidor respondió con un error (' + r.status + '). Se reintenta solo.';
      else { est.error = ''; est.ultima = new Date(ahora()).toISOString(); ultHash = h; ultEnvio = ahora(); setCfg({ nube: { ...conf(), seq, ultima: est.ultima } }); }
    } catch (e) { est.error = 'Sin conexión con el servidor. El programa sigue funcionando y se reintenta solo.'; }
    finally { ocupado = false; }
    return estado();
  }
  function iniciar() { if (timer || !conf().activo) return; timer = programar(() => { sincronizar(); }, cada); if (timer && timer.unref) timer.unref(); sincronizar(); }
  function detener() { if (timer) { cancelar(timer); timer = null; } }
  return { estado, configurar, activar, quitar, sincronizar, iniciar, detener };
}
module.exports = crear; module.exports.proyeccion = proyeccion;
