// Cobro con Mercado Pago, con la cuenta del propio comercio (QR en pantalla y terminal Point).
// Todo corre en el proceso principal: la interfaz nunca ve el token. Sin webhooks ni puertos abiertos:
// el estado se consulta (la interfaz pregunta cada pocos segundos mientras espera el cobro).
// APIs oficiales (https://www.mercadopago.com.ar/developers/es/reference):
//   POST /v1/orders (type "qr" o "point")  ·  GET /v1/orders/{id}  ·  POST /v1/orders/{id}/cancel
//   GET /terminals/v1/list  ·  GET /v1/payments/search  ·  GET /users/me
// Nada se cobra desde acá: el dinero va siempre a la cuenta del comercio.
'use strict';
const crypto = require('crypto');
const API = 'https://api.mercadopago.com';
const MEDIOS = { qr: 'Mercado Pago QR', point: 'Mercado Pago Point' };
const r2 = n => Math.round((+n || 0) * 100) / 100;
const dia = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const idOk = s => typeof s === 'string' && /^[\w.\-]{1,64}$/.test(s);
const MOTIVOS = { insufficient_amount: 'fondos insuficientes', high_risk: 'rechazado por riesgo', card_disabled: 'tarjeta deshabilitada', bad_filled_card_data: 'datos de tarjeta incorrectos', required_call_for_authorize: 'el banco pide autorizar por teléfono', max_attempts_exceeded: 'demasiados intentos', amount_limit_exceeded: 'supera el límite', canceled_on_terminal: 'cancelado en la terminal', canceled_by_api: 'cancelado desde el programa', processing_error: 'error al procesar' };

// Traduce una orden de Mercado Pago. Pura (se prueba sin red). esp = { monto, ref }.
function interpretar(o, esp) {
  const pagos = (o && o.transactions && o.transactions.payments) || [], st = o && o.status;
  const detalle = pagos.map(p => p.status_detail).find(d => MOTIVOS[d]);
  const motivo = detalle ? MOTIVOS[detalle] : '';
  if (st === 'processed') {
    const p = pagos.find(x => x.status_detail === 'accredited');
    if (!p) return { estado: 'pendiente', msg: 'Mercado Pago todavía no acreditó el pago' };
    const monto = r2(p.paid_amount != null ? p.paid_amount : p.amount);
    if (esp && (Math.abs(monto - esp.monto) > 0.005 || (o.external_reference && o.external_reference !== esp.ref)))
      return { estado: 'diferencia', msg: 'El pago no coincide con la venta (cobrado ' + monto + '): no se registró. Revisalo en Mercado Pago.' };
    return { estado: 'aprobado', pago: { orden: o.id, pago: String(p.id), ref: p.reference_id ? String(p.reference_id) : '', ext: o.external_reference || '', monto, tarjeta: (p.payment_method && p.payment_method.type) || '' } };
  }
  if (st === 'canceled') return { estado: 'cancelado', msg: 'El cobro se canceló' + (motivo ? ' (' + motivo + ')' : '') };
  if (st === 'expired') return { estado: 'expirado', msg: 'El cobro venció sin pagarse' };
  if (st === 'failed') return { estado: 'rechazado', msg: 'Mercado Pago rechazó el pago' + (motivo ? ': ' + motivo : '') };
  if (st === 'refunded') return { estado: 'devuelto', msg: 'El pago fue devuelto' };
  if (st === 'action_required') return { estado: 'pendiente', msg: 'Falta una acción en la terminal' };
  return { estado: 'pendiente', msg: motivo ? 'Intento rechazado (' + motivo + '): el cliente puede probar de nuevo' : '' };
}

// Cruza los pagos aprobados de Mercado Pago con las ventas cobradas por Mercado Pago. Pura.
// pagos: [{id, monto, ext}] · ventas: ventas con .mp (todas) · desde el punto de vista del día pedido.
function cruzar(pagos, ventas, dk) {
  const porId = new Map(), porExt = new Map();
  pagos.forEach(p => { porId.set(String(p.id), p); if (p.ext) porExt.set(String(p.ext), p); });
  const r = { coinciden: [], diferencias: [], ventasSinPago: [], pagosSinVenta: [] }, usados = new Set();
  ventas.forEach(v => {
    const p = porId.get(String(v.mp.ref || '')) || porExt.get(String(v.mp.ext || ''));
    if (p) usados.add(String(p.id));
    if (dia(v.date) !== dk) return;
    if (!p) { if (!v.void) r.ventasSinPago.push({ venta: v.id, total: v.total }); return; }
    if (v.void) r.diferencias.push({ venta: v.id, total: v.total, pago: p.id, monto: p.monto, motivo: 'La venta está anulada pero el pago figura aprobado' });
    else if (Math.abs(r2(v.total) - r2(p.monto)) > 0.005) r.diferencias.push({ venta: v.id, total: v.total, pago: p.id, monto: p.monto, motivo: 'El monto cobrado es distinto al de la venta' });
    else r.coinciden.push({ venta: v.id, total: v.total, pago: p.id });
  });
  pagos.forEach(p => { if (!usados.has(String(p.id))) r.pagosSinVenta.push({ pago: p.id, monto: p.monto, fecha: p.fecha }); });
  return r;
}

// getCfg/setCfg: configuración local · proteger/desproteger: cifrado de Windows (debe fallar si no hay) · leer: texto JSON de los datos.
function crear({ getCfg, setCfg, proteger, desproteger, leer = () => '', http = (u, o) => fetch(u, o), espera = 15000, qr = null, uuid = () => crypto.randomUUID() }) {
  const conf = () => (getCfg().mp || {});
  const cobros = new Map();   // orden -> { monto, ref, medio } (solo de esta sesión del programa)
  const token = () => { try { return conf().token ? desproteger(conf().token) : ''; } catch (e) { return ''; } };
  const estado = () => { const c = conf(); return { configurado: !!c.token, modo: c.modo || 'prueba', posQr: c.posQr || '', terminalId: c.terminalId || '', fin: c.fin || '', puedeQr: !!(c.token && c.posQr), puedePoint: !!(c.token && c.terminalId), tarjetasPoint: !!c.tarjetasPoint, puedeTarjetas: !!(c.token && c.terminalId && c.tarjetasPoint) }; };

  async function pedir(metodo, ruta, body, cab = {}) {
    const t = token(); if (!t) return { ok: false, err: 'Falta conectar Mercado Pago en Configuración' };
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), espera);
    try {
      const r = await http(API + ruta, { method: metodo, signal: ac.signal, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...cab }, body: body ? JSON.stringify(body) : undefined });
      let j = null; try { j = await r.json(); } catch (e) {}
      if (r.status >= 200 && r.status < 300) return { ok: true, status: r.status, j };
      const err = r.status === 401 || r.status === 403 ? 'Mercado Pago no aceptó el token: revisalo en Configuración' : ((j && (j.message || (j.errors && j.errors[0] && j.errors[0].message))) || 'Mercado Pago respondió con un error (' + r.status + ')');
      return { ok: false, status: r.status, err: String(err).slice(0, 200), j };
    } catch (e) {
      return { ok: false, red: true, err: 'No hay conexión con Mercado Pago. La venta no se cobró: probá de nuevo o elegí otro medio de pago.' };
    } finally { clearTimeout(timer); }
  }

  function guardar(a) {
    a = a || {}; const c = conf(), n = { ...c };
    if (typeof a.token === 'string' && a.token.trim()) {
      const t = a.token.trim();
      if (!/^[A-Za-z0-9_\-]{20,300}$/.test(t)) return { ok: false, err: 'El token no parece válido (sin espacios, entre 20 y 300 caracteres)' };
      try { n.token = proteger(t); } catch (e) { return { ok: false, err: 'Este equipo no puede cifrar el token: no se guardó' }; }
      n.fin = t.slice(-4);
    }
    if (!n.token) return { ok: false, err: 'Pegá el Access Token de Mercado Pago' };
    if (a.modo != null) {
      if (!['prueba', 'produccion'].includes(a.modo)) return { ok: false, err: 'Modo inválido' };
      if (a.modo === 'produccion' && c.modo !== 'produccion' && a.confirmaProduccion !== true) return { ok: false, err: 'Para cobrar de verdad tenés que confirmar el modo producción' };
      n.modo = a.modo;
    }
    n.modo = n.modo || 'prueba'; if (a.tarjetasPoint != null) n.tarjetasPoint = a.tarjetasPoint === true;
    for (const k of ['posQr', 'terminalId']) if (a[k] != null) { const v = String(a[k]).trim(); if (v && !idOk(v)) return { ok: false, err: 'El identificador de ' + (k === 'posQr' ? 'la caja QR' : 'la terminal') + ' tiene caracteres no permitidos' }; n[k] = v; }
    setCfg({ mp: n }); return { ok: true };
  }
  const quitar = () => { setCfg({ mp: undefined }); return { ok: true }; };

  async function probar() {
    const r = await pedir('GET', '/users/me'); if (!r.ok) return r;
    const tags = Array.isArray(r.j && r.j.tags) ? r.j.tags : null;
    return { ok: true, cuenta: String((r.j && (r.j.nickname || r.j.email || r.j.id)) || '').slice(0, 60).replace(/@.*/, '@…'), pareceDePrueba: tags ? tags.includes('test_user') : null };
  }
  // Crea en la cuenta del comercio una sucursal y una caja QR (POST /users/{id}/stores y POST /pos) y guarda el identificador externo de la caja.
  // La sucursal exige dirección y coordenadas (la API responde "location.latitude must be defined" si faltan).
  async function crearCaja(a) {
    a = a || {}; if (!conf().token) return { ok: false, err: 'Primero guardá el Access Token' };
    const txt = (k, n) => String(a[k] == null ? '' : a[k]).trim().slice(0, n), nombre = txt('nombre', 45), calle = txt('calle', 80), numero = txt('numero', 10), ciudad = txt('ciudad', 80), prov = txt('provincia', 80);
    const lat = Number(a.lat), lng = Number(a.lng);
    if (nombre.length < 2 || !/^[\p{L}\p{N} _\-]+$/u.test(nombre)) return { ok: false, err: 'El nombre del local solo puede tener letras, números, espacios, guiones y guion bajo (2 a 45)' };
    if (!calle || !numero || !ciudad || !prov) return { ok: false, err: 'Completá calle, número, localidad y provincia del local' };
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || a.lat === '' || a.lng === '' || a.lat == null || a.lng == null) return { ok: false, err: 'Faltan las coordenadas (latitud y longitud) del local. Buscá la dirección en Google Maps, clic derecho y copiá los dos números.' };
    const yo = await pedir('GET', '/users/me'); if (!yo.ok) return yo;
    const uid = yo.j && yo.j.id; if (!uid) return { ok: false, err: 'Mercado Pago no devolvió el usuario de la cuenta' };
    const sufijo = crypto.randomBytes(3).toString('hex').toUpperCase();
    const s = await pedir('POST', '/users/' + encodeURIComponent(uid) + '/stores', { name: nombre, external_id: 'SPLOCAL' + sufijo, location: { street_name: calle, street_number: numero, city_name: ciudad, state_name: prov, latitude: lat, longitude: lng } });
    if (!s.ok) return { ok: false, err: 'No se pudo crear el local: ' + s.err, red: !!s.red };
    const storeId = s.j && s.j.id; if (!storeId) return { ok: false, err: 'Mercado Pago no devolvió el local creado' };
    const ext = 'SPCAJA' + sufijo;
    const p = await pedir('POST', '/pos', { name: 'Caja 1', fixed_amount: true, store_id: storeId, external_id: ext });
    if (!p.ok) return { ok: false, err: 'El local se creó pero no la caja: ' + p.err + ' (volvé a intentar o creala a mano en Mercado Pago)', red: !!p.red };
    const g = guardar({ posQr: ext }); if (!g.ok) return g;
    return { ok: true, posQr: ext, local: String(storeId) };
  }  async function terminales() {
    const r = await pedir('GET', '/terminals/v1/list?limit=50'); if (!r.ok) return r;
    return { ok: true, terminales: (((r.j && r.j.data) || {}).terminals || []).map(t => ({ id: t.id, modo: t.operating_mode })) };
  }

  async function cobrar({ medio, monto, tarjeta }) {
    const m = r2(monto), c = conf();
    if (!c.token) return { ok: false, err: 'Falta conectar Mercado Pago en Configuración' };
    if (!(m > 0) || m > 1e8) return { ok: false, err: 'El monto no es válido' };
    if (medio !== 'qr' && medio !== 'point') return { ok: false, err: 'Medio de cobro inválido' };
    if (medio === 'qr' && !c.posQr) return { ok: false, err: 'Falta el identificador de la caja QR en Configuración' };
    if (medio === 'point' && !c.terminalId) return { ok: false, err: 'Falta elegir la terminal Point en Configuración' };
    if (tarjeta != null && (medio !== 'point' || !['debito', 'credito'].includes(tarjeta))) return { ok: false, err: 'Tipo de tarjeta inválido' };
    if (tarjeta && !c.tarjetasPoint) return { ok: false, err: 'Activá "Cobrar débito y crédito con el Point" en Configuración' };
    const ref = 'SP' + crypto.randomBytes(10).toString('hex'), monto2 = m.toFixed(2);
    const body = medio === 'qr'
      ? { type: 'qr', total_amount: monto2, external_reference: ref, description: 'Venta StockProject', expiration_time: 'PT5M', config: { qr: { external_pos_id: c.posQr, mode: 'dynamic' } }, transactions: { payments: [{ amount: monto2 }] } }
      : { type: 'point', external_reference: ref, description: 'Venta StockProject', expiration_time: 'PT5M', config: { point: { terminal_id: c.terminalId, print_on_terminal: 'no_ticket' }, ...(tarjeta ? { payment_method: { default_type: tarjeta === 'debito' ? 'debit_card' : 'credit_card' } } : {}) }, transactions: { payments: [{ amount: monto2 }] } };
    const r = await pedir('POST', '/v1/orders', body, { 'X-Idempotency-Key': uuid() });
    if (!r.ok) return { ok: false, err: r.status === 400 ? 'Mercado Pago no aceptó el cobro: ' + r.err + (medio === 'point' ? ' (revisá la terminal elegida en Configuración)' : '') : r.err, red: !!r.red };
    const o = r.j || {}; if (!o.id) return { ok: false, err: 'Mercado Pago no devolvió el cobro' };
    cobros.set(o.id, { monto: m, ref, medio });
    const datos = o.type_response && o.type_response.qr_data, out = { ok: true, orden: o.id, medio, modo: c.modo || 'prueba' };
    if (medio === 'qr') { if (!datos) return { ok: false, err: 'Mercado Pago no devolvió el código QR' }; out.qr = datos; if (qr) out.qrSvg = qr(datos); }
    return out;
  }
  const yaRegistrado = pago => { try { return (JSON.parse(leer() || '{}').sales || []).some(s => !s.void && s.mp && s.mp.pago === pago); } catch (e) { return false; } };

  async function consultar(orden) {
    const esp = cobros.get(orden); if (!esp) return { ok: false, err: 'Ese cobro ya no está en seguimiento: revisá Conciliar Mercado Pago' };
    const r = await pedir('GET', '/v1/orders/' + encodeURIComponent(orden)); if (!r.ok) return { ok: false, err: r.err, red: !!r.red };
    const x = interpretar(r.j, esp);
    if (x.estado === 'aprobado' && yaRegistrado(x.pago.pago)) return { ok: true, estado: 'yaRegistrado', msg: 'Ese pago ya estaba registrado en otra venta' };
    return { ok: true, ...x };
  }
  async function cancelar(orden) {
    if (!cobros.has(orden)) return { ok: false, err: 'Ese cobro ya no está en seguimiento' };
    const r = await pedir('POST', '/v1/orders/' + encodeURIComponent(orden) + '/cancel', null, { 'X-Idempotency-Key': uuid(), 'x-allow-cancelable-status': 'at_terminal' });
    if (r.ok) return { ok: true, estado: 'cancelado' };
    if (r.status === 409) { const q = await consultar(orden); return q.ok ? q : { ok: false, err: r.err }; }   // ya se pagó, ya estaba cancelada o no se puede cancelar
    return { ok: false, err: r.err, red: !!r.red };
  }

  // Busca los pagos aprobados del día (hora de Argentina) y los cruza con las ventas cobradas por Mercado Pago.
  async function conciliar(dk) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dk))) return { ok: false, err: 'Fecha inválida' };
    const pagos = [];
    for (let off = 0; off < 1000; off += 50) {
      const q = 'sort=date_approved&criteria=desc&range=date_approved&status=approved&limit=50&offset=' + off + '&begin_date=' + dk + 'T00:00:00.000-03:00&end_date=' + dk + 'T23:59:59.999-03:00';
      const r = await pedir('GET', '/v1/payments/search?' + q); if (!r.ok) return { ok: false, err: r.err, red: !!r.red };
      const rs = (r.j && r.j.results) || [];
      rs.filter(p => !p.status || p.status === 'approved').forEach(p => pagos.push({ id: String(p.id), monto: r2(p.transaction_amount), ext: p.external_reference || '', fecha: p.date_approved || '' }));
      if (rs.length < 50) break;
    }
    let ventas = []; try { ventas = (JSON.parse(leer() || '{}').sales || []).filter(s => s.mp); } catch (e) {}
    return { ok: true, dia: dk, pagos: pagos.length, ...cruzar(pagos, ventas, dk) };
  }
  return { estado, guardar, quitar, probar, crearCaja, terminales, cobrar, consultar, cancelar, conciliar };
}
module.exports = { crear, interpretar, cruzar, MEDIOS };
