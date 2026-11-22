// Panel para el celular desde cualquier lugar: esta PC ENVÍA al servidor central una "foto" de solo lectura
// (ventas, stock, cajas, saldos). El servidor nunca se conecta a esta PC ni puede modificar nada: no hay camino de vuelta.
// Si no hay Internet o el servidor no responde, el programa sigue funcionando igual y se reintenta solo.
// Nunca se envían contraseñas, claves, usuarios del sistema ni la configuración; de los clientes, solo nombre y saldo.
'use strict';
const crypto = require('crypto');
// Envío por diferencias: al guardar (1 s) con un mínimo de 3 s entre envíos; latido cada 10 min; foto entera al arrancar y cada 6 h para reparar.
const LATIDO = 10 * 60 * 1000, FOTO_CADA = 6 * 3600 * 1000, DEBOUNCE = 1000, ENTRE_ENVIOS = 3000, ESPERA_MAX = 10000, TIEMPO_ENVIO = 20000;
const DIR_VIEJA = 'https://stock-project-versiones.vercel.app';   // dirección del panel hasta la 5.6.0
const r2 = n => Math.round((+n || 0) * 100) / 100;
const dia = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

const OTROS = ['negocio', 'cajas', 'clientes', 'bajas', 'vencimientos', 'baldes'];
// Clave de cada producto (igual que en el servidor): código|nombre, con #n si se repite.
const claveStock = (p, vistos) => { const k = String(p.cod || '') + '|' + String(p.n || ''), v = vistos.get(k) || 0; vistos.set(k, v + 1); return v ? k + '#' + v : k; };
// Foto troceada con el texto de cada pieza, para comparar sin recorrer todo de nuevo.
function partir(foto) {
  const vistos = new Map(), ventas = new Map(), stock = new Map(), otros = {};
  foto.ventas.forEach(v => ventas.set(String(v.id), { v, j: JSON.stringify(v) }));
  foto.stock.forEach(p => { const k = claveStock(p, vistos); stock.set(k, { p: { ...p, k }, j: JSON.stringify(p) }); });
  OTROS.forEach(k => { otros[k] = JSON.stringify(foto[k]); });
  return { ventas, stock, otros };
}
// Solo lo que cambió respecto de lo que el servidor ya tiene: ventas nuevas o modificadas (una anulación cambia la venta), productos
// con otro stock o precio, los que se borraron, y las piezas chicas (cajas, saldos, bajas, vencimientos) enteras si cambiaron.
function diferencias(ant, cur) {
  const d = {}, ventas = [], stock = [], stDel = [], otros = {};
  cur.ventas.forEach((x, id) => { const a = ant.ventas.get(id); if (!a || a.j !== x.j) ventas.push(x.v); });
  cur.stock.forEach((x, k) => { const a = ant.stock.get(k); if (!a || a.j !== x.j) stock.push(x.p); });
  ant.stock.forEach((x, k) => { if (!cur.stock.has(k)) stDel.push(k); });
  OTROS.forEach(k => { if (ant.otros[k] !== cur.otros[k]) otros[k] = JSON.parse(cur.otros[k]); });
  if (ventas.length) d.ventas = ventas; if (stock.length) d.stock = stock; if (stDel.length) d.stDel = stDel; if (Object.keys(otros).length) d.otros = otros;
  return d;
}
// Arma la foto a partir de los datos. Es una función pura: se puede probar sin red.
function proyeccion(db, ahora = Date.now()) {
  db = db || {}; const hoy = dia(ahora), desde = dia(ahora - 90 * 864e5), en30 = dia(ahora + 30 * 864e5), cfg = db.cfg || {}, enc = cfg.encuesta || {};
  const prods = db.prods || [], peso = p => p.unidad === 'kg', cant = (p, q) => peso(p) ? r2(q / 1000) : q;
  const vend = p => (p.lots || []).filter(l => !l.exp || l.exp >= hoy).reduce((a, l) => a + l.qty, 0), tot = p => (p.lots || []).reduce((a, l) => a + l.qty, 0);
  const ventas = (db.sales || []).filter(s => dia(s.date) >= desde).slice(-3000).map(s => ({ id: s.id, fecha: s.date, total: r2(s.total), pago: s.pay, cliente: s.cname || null, usuario: s.user || null, ...(s.vend ? { vend: String(s.vend.nombre || s.vend) } : {}), anulada: !!s.void,
    items: (s.items || []).map(i => ({ n: i.name, q: i.qty, u: i.u, p: r2(i.price), t: r2(i.tot != null ? i.tot : i.qty * i.price) })) }));
  // Heladería: un gusto es un producto por peso con `balde` (kg por balde lleno). Baldes = todo lo que hay / kg por balde; "Pedir" si queda menos del mínimo de baldes (cfg.hel.pedir, 1 por defecto).
  const gusto = (p, t) => { if (!(p.unidad === 'kg' && p.balde > 0)) return {}; const b = r2(t / 1000 / p.balde); return { balde: r2(p.balde), baldes: b, pedir: b < ((cfg.hel && cfg.hel.pedir) || 1) }; };
  const stock = prods.filter(p => p.control !== 'variantes' && p.tipo !== 'tamano' && p.tipo !== 'armado').map(p => { const v = vend(p), t = tot(p), ex = (p.lots || []).filter(l => l.exp && l.exp >= hoy && l.qty > 0).map(l => l.exp).sort()[0] || '';
    return { n: p.name, cod: p.code || '', cat: p.cat || '', precio: r2(p.price), disp: cant(p, v), u: peso(p) ? 'kg' : undefined, min: p.min || 0, ...gusto(p, t), vence: ex, estado: v <= 0 ? (t > 0 ? 'vencido' : 'sin') : p.min && v <= (peso(p) ? p.min * 1000 : p.min) ? 'bajo' : 'ok' }; });
  const cajas = (db.cajas || []).slice(-30).map(c => { const k = c.cierre && c.tot ? c.tot : calcCaja(db, c); return { usuario: c.user, caja: c.caja, abre: c.abre, cierre: c.cierre || null, ini: r2(c.ini), esperado: r2(k.esperado), contado: c.cierre ? r2(c.contado) : null, dif: c.cierre ? r2(c.dif) : null, vendido: r2(k.vendido), porMedio: k.porMedio || {} }; });
  const saldo = new Map(), sum = (id, n) => saldo.set(id, (saldo.get(id) || 0) + n);
  (db.sales || []).forEach(s => { if (s.cid != null && !s.void && s.pay === 'Cuenta corriente') sum(s.cid, s.total); });
  (db.cargos || []).forEach(x => sum(x.cid, x.amount)); (db.pays || []).forEach(p => sum(p.cid, -p.amount));
  const clientes = (db.clients || []).map(c => ({ n: c.name, saldo: r2(saldo.get(c.id) || 0) })).filter(c => Math.abs(c.saldo) >= 0.005);
  const bajas = (db.desv || []).filter(v => !v.void && dia(v.date) >= desde).slice(-300).map(v => ({ fecha: v.date, motivo: v.reason || '', detalle: (v.items || []).map(i => i.qty + ' x ' + i.name).join(', '), costo: r2((v.items || []).reduce((a, i) => a + i.qty * (i.cost || 0), 0)), usuario: v.user || null }));
  const vencimientos = []; prods.forEach(p => (p.lots || []).forEach(l => { if (l.exp && l.qty > 0 && l.exp <= en30) vencimientos.push({ n: p.name, lote: l.n, cant: cant(p, l.qty), vence: l.exp, estado: l.exp < hoy ? 'vencido' : 'porvencer' }); }));
  // Últimos movimientos de baldes de la heladería (db.baldes, opcional): quién, cuándo, qué gusto y si entró un balde o se ajustó lo que queda.
  const baldes = (Array.isArray(db.baldes) ? db.baldes : []).slice(-20).map(b => ({ fecha: b.date || '', usuario: b.user || null, n: b.gusto || '', t: b.t === 'ingreso' ? 'ingreso' : 'ajuste', baldes: r2(b.baldes) }));
  return { v: 1, generado: new Date(ahora).toISOString(), negocio: { nombre: (db.shop && db.shop.n) || 'Mi negocio', moneda: cfg.moneda || enc.mon || 'ARS', loc: cfg.loc || enc.loc || 'es-AR' }, ventas, stock, cajas, clientes, bajas, vencimientos, baldes };
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
function crear({ leer, getCfg, setCfg, servidor = '', enviar = (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(TIEMPO_ENVIO) }), ahora = () => Date.now(), proteger = s => s, desproteger = s => s, cada = 30000, programar = setInterval, cancelar = clearInterval, esperar = setTimeout, noEsperar = clearTimeout }) {
  let timer = null, ocupado = false, rehacer = false, est = { ultima: null, error: '', intento: null }, ultEnvio = 0, ultFoto = 0, ultInicio = 0, espera = null;
  // Diferencias: acked = lo último que el servidor confirmó; enVuelo = envío sin confirmar (se repite igual); inst = identifica esta ejecución del programa.
  let acked = null, enVuelo = null, n = 0, fallos = 0, noAntes = 0, soloFoto = false; const inst = 'i' + crypto.randomBytes(8).toString('hex');
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
    setCfg({ nube: { ...c, url: servidor.replace(/\/+$/, ''), token: proteger(j.token), clave: proteger(cl), panel: String(j.panel || ''), activo: true } }); est = { ultima: null, error: '', intento: null }; reiniciar();
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
    setCfg({ nube: { ...conf(), url, token: proteger(t), panel: String(panel || '').trim().slice(0, 200), activo: true } }); est = { ultima: null, error: '', intento: null }; reiniciar();
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
    const c = conf(), t = token(); if (!c.activo || !c.url || !t) return estado();
    if (ocupado) { rehacer = true; return estado(); }
    if (!forzar && ahora() < noAntes) { armar(noAntes - ahora()); return estado(); }   // espera creciente tras un fallo: reintenta justo al vencer
    ocupado = true; est.intento = new Date(ahora()).toISOString(); ultInicio = ahora();
    try {
      let db; try { db = JSON.parse(leer() || 'null'); } catch (e) { db = null; }
      if (!db) { est.error = 'No se pudieron leer los datos locales'; return estado(); }
      const foto = proyeccion(db, ahora()), cur = partir(foto);
      for (let vuelta = 0; vuelta < 3; vuelta++) {
        // Un envío por diferencias que quedó sin confirmar se repite IGUAL (mismo n): si el servidor ya lo aplicó, lo reconoce y no lo duplica.
        if (enVuelo && enVuelo.tipo === 'foto') enVuelo = null;
        if (!enVuelo) {
          const dif = acked && !forzar ? diferencias(acked, cur) : null, hay = dif && Object.keys(dif).length > 0;
          if (acked && !forzar && !hay && ahora() - ultEnvio < LATIDO) return estado();   // sin cambios: solo el latido
          const entera = !acked || forzar || soloFoto || ahora() - ultFoto >= FOTO_CADA;
          enVuelo = entera ? { tipo: 'foto', n: ++n, destino: cur } : { tipo: 'dif', n: ++n, destino: cur, cuerpo: { inst, n, generado: foto.generado, ...dif } };
        }
        const e = enVuelo, seq = Math.max((c.seq || 0) + 1, ahora());
        const r = await enviar(c.url + (e.tipo === 'foto' ? '/ingesta' : '/ingesta/ops'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(e.tipo === 'foto' ? { seq, foto, inst, n: e.n } : e.cuerpo) });
        let j = null; try { j = r.json ? await r.json() : null; } catch (x) {}
        // El servidor pide la foto entera (instalación nueva, hueco, estado perdido) o no conoce las diferencias (versión vieja del servidor).
        if (e.tipo === 'dif' && vuelta < 2 && (r.status === 409 || r.status === 404 || r.status === 405 || r.status === 413 || (j && j.pedirFoto))) { if (r.status === 404 || r.status === 405) soloFoto = true; acked = null; enVuelo = null; continue; }
        if (r.status === 401) { est.error = 'El servidor no reconoce la clave de esta instalación. Pedí una nueva a soporte.'; fallo(); }
        else if (r.status === 413) { est.error = 'Hay demasiados datos para enviar de una vez.'; fallo(); }
        else if (!r.ok) { est.error = 'El servidor respondió con un error (' + r.status + '). Se reintenta solo.'; fallo(); }
        else {
          est.error = ''; est.ultima = new Date(ahora()).toISOString(); acked = e.destino; enVuelo = null; fallos = 0; noAntes = 0; ultEnvio = ahora();
          if (e.tipo === 'foto') { ultFoto = ahora(); setCfg({ nube: { ...conf(), seq, ultima: est.ultima } }); }   // el seq solo importa para las fotos enteras
          // Si el envío confirmado era uno repetido y mientras tanto hubo más cambios, se mandan ya (sin esperar al próximo aviso).
          if (e.destino !== cur && vuelta < 2 && Object.keys(diferencias(acked, cur)).length) { forzar = false; continue; }
        }
        break;
      }
    } catch (e) { est.error = 'Sin conexión con el servidor. El programa sigue funcionando y se reintenta solo.'; fallo(); }
    finally { ocupado = false; if (rehacer) { rehacer = false; avisar(); } }
    return estado();
  }
  // Espera 2, 4, 8 y 10 s entre reintentos (tope 10 s: al volver el servidor se recupera enseguida). Con el servidor caído el pedido ni llega a la base.
  function fallo() { fallos++; const d = Math.min(ESPERA_MAX, 2000 * 2 ** (fallos - 1)); noAntes = ahora() + d; armar(d); }
  // Un solo temporizador de envío a la vez (el de guardar, el de reintento y el de volver la red comparten este).
  function armar(ms) {
    if (espera) return;
    espera = esperar(() => { espera = null; sincronizar(); }, ms);
    if (espera && espera.unref) espera.unref();
  }
  // Volvió la red (evento "online" de la ventana): reintenta ya, sin esperar la espera creciente.
  function reintentarYa() { noAntes = 0; return sincronizar(); }
  function reiniciar() { acked = null; enVuelo = null; fallos = 0; noAntes = 0; soloFoto = false; }
  // Se llama cada vez que se guardan datos: manda en ~1 s (nunca más de un envío cada 3 s). No espera al ciclo de 30 s, que queda de respaldo.
  function avisar() {
    if (!estado().configurado || !conf().activo) return;
    armar(Math.max(DEBOUNCE, ultInicio + ENTRE_ENVIOS - ahora()));
  }  function iniciar() { if (timer || !(conf().activo || conf().pendiente)) return; timer = programar(() => { sincronizar(); }, cada); if (timer && timer.unref) timer.unref(); sincronizar(); }
  function detener() { if (timer) { cancelar(timer); timer = null; } if (espera) { noEsperar(espera); espera = null; } }
  return { estado, configurar, activar, quitar, sincronizar, avisar, reintentarYa, iniciar, detener, registrar, clave, cambiarClave };
}
module.exports = crear; module.exports.proyeccion = proyeccion; module.exports.LATIDO = LATIDO; module.exports.errorClave = errorClave;
