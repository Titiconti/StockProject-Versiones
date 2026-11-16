// Panel para el celular desde cualquier lugar: esta PC ENVÍA al servidor central una "foto" de solo lectura
// (ventas, stock, cajas, saldos). El servidor nunca se conecta a esta PC ni puede modificar nada: no hay camino de vuelta.
// Si no hay Internet o el servidor no responde, el programa sigue funcionando igual y se reintenta solo.
// Nunca se envían contraseñas, claves, usuarios del sistema ni la configuración; de los clientes, solo nombre y saldo.
'use strict';
const LATIDO = 5 * 60 * 1000;
const DIR_VIEJA = 'https://stock-project-versiones.vercel.app';   // dirección del panel hasta la 5.6.0
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
// Mismas reglas que el servidor para una clave elegida por el usuario.
function errorClave(k, nombre) {
  k = String(k || '').trim();
  if (k.length < 8 || k.length > 64) return 'La clave tiene que tener entre 8 y 64 caracteres';
  if (!/\p{L}/u.test(k) || !/\p{N}/u.test(k)) return 'La clave tiene que tener al menos una letra y un número';
  if (nombre && k.toLowerCase() === String(nombre).trim().toLowerCase()) return 'La clave no puede ser igual al nombre del negocio';
  return '';
}
function calcCaja(db, c) {
  const S = (db.sales || []).filter(s => s.caja === c.id && !s.void), P = (db.pays || []).filter(p => p.caja === c.id), M = c.movs || [], porMedio = {};
  S.forEach(s => { porMedio[s.pay] = r2((porMedio[s.pay] || 0) + s.total); });
  const ef = (porMedio.Efectivo || 0) + P.filter(p => p.method === 'Efectivo').reduce((a, p) => a + p.amount, 0) + M.reduce((a, m) => a + (m.t === 'ingreso' ? m.monto : -m.monto), 0);
  return { vendido: S.reduce((a, s) => a + s.total, 0), porMedio, esperado: c.ini + ef };
}

// leer(): texto JSON actual · getCfg()/setCfg(patch): configuración local · proteger/desproteger: cifrado del sistema para la clave.
// servidor: dirección del servidor del panel que trae el programa (defaults.json > nube). Sirve para el alta automática.
function crear({ leer, getCfg, setCfg, servidor = '', enviar = (u, o) => fetch(u, o), ahora = () => Date.now(), proteger = s => s, desproteger = s => s, cada = 30000, programar = setInterval, cancelar = clearInterval }) {
  let timer = null, ocupado = false, est = { ultima: null, error: '', intento: null }, ultHash = '', ultEnvio = 0;
  const conf = () => (getCfg().nube || {});
  const token = () => { try { return conf().token ? desproteger(conf().token) : ''; } catch (e) { return ''; } };
  const urlOk = u => { try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname)); } catch (e) { return false; } };
  const estado = () => { const c = conf(); return { configurado: !!(c.url && c.token), activo: !!c.activo, url: c.url || '', panel: c.panel || '', tieneClave: !!c.clave, pendiente: c.pendiente ? c.pendiente.nombre : '', puedeCrear: urlOk(servidor), ultima: est.ultima || c.ultima || null, error: est.error, intento: est.intento }; };
  // Clave para entrar al panel desde el celular: se guarda cifrada y solo se muestra a quien puede administrar el panel.
  const clave = () => { try { return conf().clave ? desproteger(conf().clave) : ''; } catch (e) { return ''; } };
  // Crea el panel del comercio en el servidor. Sin Internet queda pendiente y se reintenta solo en cada ciclo.
  // clave (opcional): la que eligió el usuario; si no viene, el servidor genera una.
  async function registrar(nombre, clave) {
    nombre = String(nombre || '').replace(/\s+/g, ' ').trim(); clave = typeof clave === 'string' ? clave.trim() : '';
    if (nombre.length < 2 || nombre.length > 80) return { ok: false, err: 'Escribí el nombre del negocio (2 a 80 caracteres)' };
    if (clave) { const e = errorClave(clave, nombre); if (e) return { ok: false, err: e }; }
    if (estado().configurado) return { ok: false, err: 'Este negocio ya tiene su panel' };
    if (!urlOk(servidor)) return { ok: false, err: 'Este programa no tiene configurado el servidor del panel' };
    setCfg({ nube: { ...conf(), pendiente: { nombre, desde: new Date(ahora()).toISOString(), ...(clave ? { clave: proteger(clave) } : {}) } } });
    let r; try { r = await enviar(servidor.replace(/\/+$/, '') + '/registro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clave ? { nombre, clave } : { nombre }) }); }
    catch (e) { est.error = 'Sin conexión: el panel se va a crear solo cuando vuelva Internet.'; return { ok: false, pendiente: true, err: est.error }; }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j || !j.token) { est.error = (j && j.error) || 'El servidor no pudo crear el panel (' + r.status + '). Se reintenta solo.'; return { ok: false, pendiente: r.status >= 500 || r.status === 429, err: est.error }; }
    const c = conf(); delete c.pendiente;
    const cl = clave || j.clave;
    setCfg({ nube: { ...c, url: servidor.replace(/\/+$/, ''), token: proteger(j.token), clave: proteger(cl), panel: String(j.panel || ''), activo: true } }); est = { ultima: null, error: '', intento: null }; ultHash = '';
    detener(); iniciar();
    return { ok: true, panel: j.panel, clave: cl };
  }
  // Cambia la clave del panel desde esta PC (con el token de instalación; no hace falta la actual).
  async function cambiarClave(nueva) {
    nueva = typeof nueva === 'string' ? nueva.trim() : '';
    const c = conf(), t = token(); if (!c.url || !t) return { ok: false, err: 'Primero creá o conectá tu panel' };
    const e = errorClave(nueva, (c.pendiente && c.pendiente.nombre) || ''); if (e) return { ok: false, err: e };
    let r; try { r = await enviar(c.url + '/clave-instalacion', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ nueva }) }); }
    catch (x) { return { ok: false, err: 'Sin conexión con el servidor. Probá de nuevo cuando haya Internet.' }; }
    let j = null; try { j = await r.json(); } catch (x) {}
    if (!r.ok) return { ok: false, err: (j && j.error) || 'El servidor no pudo cambiar la clave (' + r.status + ').' };
    setCfg({ nube: { ...conf(), clave: proteger(nueva) } });
    return { ok: true };
  }
  function configurar({ url, token: t, panel }) {
    url = String(url || '').trim().replace(/\/+$/, ''); t = String(t || '').trim();
    if (!urlOk(url)) return { ok: false, err: 'La dirección del servidor tiene que empezar con https://' };
    if (!/^spn_[0-9a-f]{48}$/.test(t)) return { ok: false, err: 'La clave de instalación no es válida (empieza con spn_)' };
    setCfg({ nube: { ...conf(), url, token: proteger(t), panel: String(panel || '').trim().slice(0, 200), activo: true } }); est = { ultima: null, error: '', intento: null }; ultHash = '';
    return { ok: true };
  }
  function activar(on) { if (on && !estado().configurado) return { ok: false, err: 'Primero cargá la dirección y la clave' }; setCfg({ nube: { ...conf(), activo: !!on } }); if (on) iniciar(); else detener(); return { ok: true }; }
  function quitar() { detener(); setCfg({ nube: {} }); est = { ultima: null, error: '', intento: null }; return { ok: true }; }
  // Las instalaciones que crearon su panel antes de la 5.6.1 guardaron la dirección vieja: se pasan solas a la del programa.
  function mudar() {
    const c = conf(), nueva = servidor.replace(/\/+$/, '');
    if (c.url !== DIR_VIEJA || !urlOk(nueva) || nueva === DIR_VIEJA) return;
    setCfg({ nube: { ...c, url: nueva, panel: String(c.panel || '').split(DIR_VIEJA).join(nueva) } });
  }
  async function sincronizar(forzar) {
    mudar();
    if (conf().pendiente && !estado().configurado && !ocupado) { ocupado = true; try { const p = conf().pendiente; let k = ''; try { k = p.clave ? desproteger(p.clave) : ''; } catch (e) {} await registrar(p.nombre, k); } finally { ocupado = false; } }
    const c = conf(), t = token(); if (!c.activo || !c.url || !t || ocupado) return estado();
    ocupado = true; est.intento = new Date(ahora()).toISOString();
    try {
      let db; try { db = JSON.parse(leer() || 'null'); } catch (e) { db = null; }
      if (!db) { est.error = 'No se pudieron leer los datos locales'; return estado(); }
      const foto = proyeccion(db, ahora()), h = JSON.stringify({ ...foto, generado: 0 });
      // Sin cambios se reenvía igual cada 5 minutos: así el panel sabe que el comercio sigue conectado sin gastar
      // el cupo del servidor gratuito. Los cambios (una venta, un cierre de caja) salen en el próximo ciclo de 30 s.
      if (!forzar && h === ultHash && ahora() - ultEnvio < LATIDO) return estado();
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
  function iniciar() { if (timer || !(conf().activo || conf().pendiente)) return; timer = programar(() => { sincronizar(); }, cada); if (timer && timer.unref) timer.unref(); sincronizar(); }
  function detener() { if (timer) { cancelar(timer); timer = null; } }
  return { estado, configurar, activar, quitar, sincronizar, iniciar, detener, registrar, clave, cambiarClave };
}
module.exports = crear; module.exports.proyeccion = proyeccion; module.exports.LATIDO = LATIDO; module.exports.errorClave = errorClave;
