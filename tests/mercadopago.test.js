// Cobro con Mercado Pago: todo con respuestas HTTP simuladas. Nunca se llama a Mercado Pago real ni se usa un token real.
const assert = require('assert'), { crear, interpretar, cruzar } = require('../mercadopago.js'), validar = require('../validar.js');
const TOKEN = 'TEST-1234567890-abcdefghij-SECRETO-9999';
const resp = (status, j) => ({ status, json: async () => j });
const orden = (status, pago = {}, extra = {}) => ({ id: 'ORD1', status, external_reference: 'REF', transactions: { payments: [{ id: 'PAY1', amount: '150.00', status_detail: status === 'processed' ? 'accredited' : status, reference_id: '555', ...pago }] }, ...extra });

function nuevo(handler, ventas = [], opts = {}) {
  let cfg = {}, llamadas = [], sales = ventas;
  const http = async (url, o) => { llamadas.push({ url, ...o, body: o.body ? JSON.parse(o.body) : null }); return handler(url, o, llamadas); };
  const mp = crear({ getCfg: () => cfg, setCfg: p => { cfg = { ...cfg, ...p }; }, proteger: t => 'ss:' + Buffer.from(t).toString('base64'), desproteger: t => Buffer.from(t.slice(3), 'base64').toString(),
    leer: () => JSON.stringify({ sales }), http, qr: d => '<svg>' + d + '</svg>', uuid: (() => { let n = 0; return () => 'u' + ++n; })(), ...opts });
  return { mp, llamadas, cfg: () => cfg, ventas: v => { sales = v; } };
}
const conectado = (h, v, o) => { const t = nuevo(h, v, o); assert(t.mp.guardar({ token: TOKEN, posQr: 'CAJA1', terminalId: 'PAX_A910__123' }).ok); return t; };

(async () => {
  // ---- Credenciales: cifradas, por defecto modo prueba, nunca en claro ----
  { const t = nuevo(() => resp(200, {}));
    assert(!t.mp.guardar({ token: 'corto' }).ok && !t.mp.guardar({ token: 'con espacios ' + 'x'.repeat(30) }).ok, 'token inválido');
    assert(t.mp.guardar({ token: TOKEN }).ok);
    assert(!JSON.stringify(t.cfg()).includes('SECRETO'), 'el token no queda en claro en la configuración');
    const e = t.mp.estado(); assert.strictEqual(e.modo, 'prueba', 'modo prueba por defecto'); assert(e.configurado && !JSON.stringify(e).includes('SECRETO') && e.fin === '9999');
    assert(!t.mp.guardar({ modo: 'produccion' }).ok, 'producción pide confirmación'); assert.strictEqual(t.mp.estado().modo, 'prueba');
    assert(t.mp.guardar({ modo: 'produccion', confirmaProduccion: true }).ok && t.mp.estado().modo === 'produccion');
    assert(!t.mp.guardar({ posQr: '../x' }).ok, 'identificador con caracteres raros');
    const sin = nuevo(() => resp(200, {}), [], { proteger: () => { throw new Error('sin cifrado'); } }); assert(!sin.mp.guardar({ token: TOKEN }).ok && !sin.mp.estado().configurado, 'sin cifrado de Windows no se guarda');
    assert(t.mp.quitar().ok && !t.mp.estado().configurado); }

  // ---- Crear cobros ----
  { const t = conectado((u, o, l) => resp(201, { id: 'ORD1', status: 'created', type_response: { qr_data: '000201-QR' } }));
    const r = await t.mp.cobrar({ medio: 'qr', monto: 150 }); assert(r.ok && r.orden === 'ORD1' && r.qr === '000201-QR' && r.qrSvg.includes('000201-QR') && r.modo === 'prueba');
    const c = t.llamadas[0]; assert(c.url === 'https://api.mercadopago.com/v1/orders' && c.method === 'POST' && c.headers.Authorization === 'Bearer ' + TOKEN && c.headers['X-Idempotency-Key'] === 'u1');
    assert(c.body.type === 'qr' && c.body.total_amount === '150.00' && c.body.config.qr.external_pos_id === 'CAJA1' && /^SP[0-9a-f]{20}$/.test(c.body.external_reference) && c.body.transactions.payments[0].amount === '150.00');
    const p = await t.mp.cobrar({ medio: 'point', monto: 99.5 }); assert(p.ok && !p.qr); const b = t.llamadas[1].body; assert(b.type === 'point' && b.config.point.terminal_id === 'PAX_A910__123' && b.transactions.payments[0].amount === '99.50');
    assert(!(await t.mp.cobrar({ medio: 'qr', monto: 0 })).ok && !(await t.mp.cobrar({ medio: 'x', monto: 5 })).ok && !(await t.mp.cobrar({ medio: 'qr', monto: -3 })).ok);
    const sinPos = nuevo(() => resp(200, {})); sinPos.mp.guardar({ token: TOKEN }); assert(/caja QR/.test((await sinPos.mp.cobrar({ medio: 'qr', monto: 5 })).err) && /terminal/.test((await sinPos.mp.cobrar({ medio: 'point', monto: 5 })).err)); }

  // ---- Estados del pago ----
  { let t2; t2 = conectado(u => u.endsWith('/v1/orders') ? resp(201, { id: 'ORD1', type_response: { qr_data: 'q' } }) : resp(200, orden('processed', {}, { external_reference: t2.llamadas[0].body.external_reference })));
    await t2.mp.cobrar({ medio: 'qr', monto: 150 });
    const a = await t2.mp.consultar('ORD1'); assert(a.ok && a.estado === 'aprobado' && a.pago.pago === 'PAY1' && a.pago.ref === '555' && a.pago.monto === 150, 'aprobado');
    // pago duplicado: la misma operación ya registrada en una venta no se vuelve a registrar
    t2.ventas([{ id: 1, total: 150, mp: { pago: 'PAY1' } }]); assert.strictEqual((await t2.mp.consultar('ORD1')).estado, 'yaRegistrado', 'duplicado'); }
  assert.strictEqual(interpretar(orden('processed'), { monto: 100, ref: 'REF' }).estado, 'diferencia', 'monto distinto');
  assert.strictEqual(interpretar(orden('processed'), { monto: 150, ref: 'OTRA' }).estado, 'diferencia', 'referencia distinta');
  assert.strictEqual(interpretar(orden('failed', { status_detail: 'insufficient_amount' })).estado, 'rechazado'); assert(/fondos insuficientes/.test(interpretar(orden('failed', { status_detail: 'insufficient_amount' })).msg));
  for (const s of ['created', 'at_terminal', 'action_required']) assert.strictEqual(interpretar(orden(s)).estado, 'pendiente', s);
  assert.strictEqual(interpretar(orden('canceled')).estado, 'cancelado'); assert.strictEqual(interpretar(orden('expired')).estado, 'expirado'); assert.strictEqual(interpretar(orden('refunded')).estado, 'devuelto');
  assert.strictEqual(interpretar(orden('processed', { status_detail: 'in_review' })).estado, 'pendiente', 'procesada pero no acreditada: no se da por cobrada');
  assert.strictEqual(interpretar(orden('created', { status_detail: 'high_risk' })).estado, 'pendiente', 'intento rechazado en QR: sigue esperando');

  // ---- Sin internet, timeout, token malo: nunca aprueba ----
  { const t = conectado(() => { throw new Error('ENOTFOUND'); });
    const r = await t.mp.cobrar({ medio: 'qr', monto: 10 }); assert(!r.ok && r.red && /No hay conexión/.test(r.err) && !JSON.stringify(r).includes('SECRETO')); }
  { const t = conectado((u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('abort')))), [], { espera: 30 });
    const r = await t.mp.cobrar({ medio: 'qr', monto: 10 }); assert(!r.ok && r.red, 'timeout'); }
  { const t = conectado(() => resp(401, { message: 'invalid token' })); const r = await t.mp.cobrar({ medio: 'qr', monto: 10 }); assert(!r.ok && /token/.test(r.err)); assert(!(await t.mp.consultar('NOEXISTE')).ok); }
  { let n = 0; const t = conectado(u => { if (u.endsWith('/v1/orders')) return resp(201, { id: 'ORD1', type_response: { qr_data: 'q' } }); if (++n === 1) throw new Error('red'); return resp(200, orden('created')); });
    await t.mp.cobrar({ medio: 'qr', monto: 150 }); const a = await t.mp.consultar('ORD1'); assert(!a.ok && a.red && a.estado === undefined, 'si falla la consulta no se aprueba'); assert.strictEqual((await t.mp.consultar('ORD1')).estado, 'pendiente'); }

  // ---- Cancelación ----
  { const t = conectado((u, o) => u.endsWith('/cancel') ? resp(200, {}) : resp(201, { id: 'ORD1', type_response: { qr_data: 'q' } }));
    await t.mp.cobrar({ medio: 'point', monto: 150 }); const c = await t.mp.cancelar('ORD1'); assert(c.ok && c.estado === 'cancelado');
    const l = t.llamadas.at(-1); assert(l.url.endsWith('/v1/orders/ORD1/cancel') && l.headers['X-Idempotency-Key'] && l.headers['x-allow-cancelable-status'] === 'at_terminal'); }
  { let ref; const t = conectado((u, o, ll) => { if (u.endsWith('/v1/orders')) return resp(201, { id: 'ORD1', type_response: { qr_data: 'q' } }); if (u.endsWith('/cancel')) return resp(409, { message: 'cannot_cancel_order' }); return resp(200, orden('processed', {}, { external_reference: ll[0].body.external_reference })); });
    await t.mp.cobrar({ medio: 'qr', monto: 150 }); const c = await t.mp.cancelar('ORD1'); assert.strictEqual(c.estado, 'aprobado', 'se canceló justo cuando el cliente ya había pagado: se detecta el pago'); }

  // ---- Conciliación con diferencias ----
  { const dk = '2026-03-10', ISO = h => new Date(`${dk}T${h}:00`).toISOString();
    const ventas = [
      { id: 1, date: ISO('10:00'), total: 100, pay: 'Mercado Pago QR', mp: { pago: 'P1', ref: '1001', ext: 'E1' } },        // coincide
      { id: 2, date: ISO('11:00'), total: 200, pay: 'Mercado Pago Point', mp: { pago: 'P2', ref: '1002', ext: 'E2' } },     // monto distinto
      { id: 3, date: ISO('12:00'), total: 300, pay: 'Mercado Pago QR', mp: { pago: 'P3', ref: '1003', ext: 'E3' } },        // no hay pago
      { id: 4, date: ISO('13:00'), total: 400, pay: 'Mercado Pago QR', void: true, mp: { pago: 'P4', ref: '1004', ext: 'E4' } }]; // anulada pero cobrada
    const pagos = [{ id: 1001, transaction_amount: 100, external_reference: 'E1' }, { id: 1002, transaction_amount: 250, external_reference: 'E2' }, { id: 1004, transaction_amount: 400, external_reference: 'E4' }, { id: 9999, transaction_amount: 55, external_reference: '' }];
    const t = conectado(u => resp(200, { results: pagos.map(p => ({ ...p, date_approved: dk })) }), ventas);
    const r = await t.mp.conciliar(dk); assert(r.ok && r.pagos === 4);
    assert.strictEqual(r.coinciden.length, 1); assert.deepStrictEqual(r.diferencias.map(d => d.venta).sort(), [2, 4]); assert.deepStrictEqual(r.ventasSinPago.map(x => x.venta), [3]); assert.deepStrictEqual(r.pagosSinVenta.map(x => x.pago), ['9999']);
    const q = t.llamadas[0].url; assert(q.startsWith('https://api.mercadopago.com/v1/payments/search?') && /status=approved/.test(q) && /range=date_approved/.test(q) && /begin_date=2026-03-10T00:00:00.000-03:00/.test(q));
    assert(!(await t.mp.conciliar('hoy')).ok);
    const off = conectado(() => { throw new Error('red'); }); assert(!(await off.mp.conciliar(dk)).ok, 'sin internet no concilia');
    // paginado: 50 + 3 resultados
    let pg = 0; const t2 = conectado(u => resp(200, { results: Array.from({ length: pg++ === 0 ? 50 : 3 }, (_, i) => ({ id: pg * 100 + i, transaction_amount: 1 })) })); assert.strictEqual((await t2.mp.conciliar(dk)).pagos, 53); }
  assert.deepStrictEqual(cruzar([], [], '2026-01-01'), { coinciden: [], diferencias: [], ventasSinPago: [], pagosSinVenta: [] });

  // ---- El proceso principal rechaza un pago registrado dos veces ----
  { const v = (id, pago, extra) => ({ id, date: new Date().toISOString(), total: 5, items: [{ qty: 1, price: 5 }], pay: 'Mercado Pago QR', mp: { pago }, ...extra }), base = { prods: [], cfg: { cajaObligatoria: false } };
    assert(!validar(null, { ...base, sales: [v(1, 'A'), v(2, 'B')] }), 'dos pagos distintos');
    assert(/ya está registrado/.test(validar(null, { ...base, sales: [v(1, 'A'), v(2, 'A')] })), 'mismo pago en dos ventas');
    assert(!validar(null, { ...base, sales: [v(1, 'A', { void: true }), v(2, 'A')] }), 'si la anterior está anulada se puede volver a usar'); }
  // ---- Crear caja QR automáticamente (local + caja en la cuenta del comercio) ----
  { const dir = { nombre: 'Kiosco Ana', calle: 'Mitre', numero: '123', ciudad: 'Rosario', provincia: 'Santa Fe', lat: -32.9442, lng: -60.6505 };
    const t = conectado((u, o) => u.endsWith('/users/me') ? resp(200, { id: 777 }) : u.endsWith('/users/777/stores') ? resp(201, { id: '55' }) : resp(201, { id: 9, external_id: 'x' }));
    const r = await t.mp.crearCaja(dir); assert(r.ok && /^SPCAJA[0-9A-F]{6}$/.test(r.posQr) && r.local === '55', 'crea y devuelve el identificador');
    const [me, st, pos] = t.llamadas; assert(me.url.endsWith('/users/me') && st.method === 'POST' && st.url === 'https://api.mercadopago.com/users/777/stores' && st.headers.Authorization === 'Bearer ' + TOKEN);
    assert(st.body.name === 'Kiosco Ana' && /^SPLOCAL[0-9A-F]{6}$/.test(st.body.external_id) && st.body.location.street_name === 'Mitre' && st.body.location.latitude === -32.9442 && st.body.location.longitude === -60.6505 && st.body.location.city_name === 'Rosario' && st.body.location.state_name === 'Santa Fe');
    assert(pos.url === 'https://api.mercadopago.com/pos' && pos.body.store_id === '55' && pos.body.external_id === r.posQr && pos.body.fixed_amount === true && !('category' in pos.body), 'caja sin category');
    assert.strictEqual(t.mp.estado().posQr, r.posQr, 'queda guardada en Caja QR'); assert(t.mp.estado().puedeQr);
    for (const [k, v] of [['calle', ''], ['lat', null], ['lat', 95], ['lng', ''], ['nombre', 'a'], ['nombre', 'Kiosco <script>']]) { const m = conectado(() => resp(200, {})); assert(!(await m.mp.crearCaja({ ...dir, [k]: v })).ok && !m.llamadas.length, 'valida antes de llamar: ' + k); }
    const sinTok = nuevo(() => resp(200, {})); assert(/Access Token/.test((await sinTok.mp.crearCaja(dir)).err));
    const e1 = conectado(u => u.endsWith('/users/me') ? resp(200, { id: 777 }) : resp(400, { message: 'location.latitude must be defined.' })); const x1 = await e1.mp.crearCaja(dir); assert(!x1.ok && /No se pudo crear el local: location.latitude/.test(x1.err) && e1.mp.estado().posQr === 'CAJA1');
    const e2 = conectado(u => u.endsWith('/users/me') ? resp(200, { id: 777 }) : u.endsWith('/stores') ? resp(201, { id: '55' }) : resp(409, { message: 'point_of_sale_exists' })); const x2 = await e2.mp.crearCaja(dir); assert(!x2.ok && /local se creó pero no la caja/.test(x2.err) && e2.mp.estado().posQr === 'CAJA1');
    const e3 = conectado(() => { throw new Error('red'); }); const x3 = await e3.mp.crearCaja(dir); assert(!x3.ok && x3.red && /No hay conexión/.test(x3.err));
    const e4 = conectado(() => resp(401, {})); assert(/token/.test((await e4.mp.crearCaja(dir)).err)); }
  // ---- Débito y crédito con el Point ----
  { let ref; const t = conectado((u, o, ll) => u.endsWith('/v1/orders') ? resp(201, { id: 'ORD1', type_response: {} }) : resp(200, orden('processed', { payment_method: { type: 'debit_card', id: 'debmaster' } }, { external_reference: ll[0].body.external_reference })));
    assert(!(await t.mp.cobrar({ medio: 'point', monto: 150, tarjeta: 'debito' })).ok, 'apagado: no manda tarjetas al Point'); assert(!t.mp.estado().puedeTarjetas);
    assert(t.mp.guardar({ tarjetasPoint: true }).ok && t.mp.estado().puedeTarjetas, 'encendido con terminal');
    assert(!(await t.mp.cobrar({ medio: 'point', monto: 150, tarjeta: 'cuotas' })).ok && !(await t.mp.cobrar({ medio: 'qr', monto: 150, tarjeta: 'debito' })).ok, 'tipo inválido o con QR');
    const d = await t.mp.cobrar({ medio: 'point', monto: 150, tarjeta: 'debito' }); assert(d.ok); const b = t.llamadas.at(-1).body; assert(b.type === 'point' && b.config.payment_method.default_type === 'debit_card' && b.config.point.terminal_id === 'PAX_A910__123');
    const a = await t.mp.consultar('ORD1'); assert(a.estado === 'aprobado' && a.pago.tarjeta === 'debit_card', 'devuelve el tipo de tarjeta del pago');
    const c = await t.mp.cobrar({ medio: 'point', monto: 150, tarjeta: 'credito' }); assert(c.ok && t.llamadas.at(-1).body.config.payment_method.default_type === 'credit_card');
    await t.mp.cobrar({ medio: 'point', monto: 150 }); assert(!('payment_method' in t.llamadas.at(-1).body.config), '"Mercado Pago Point" sin tarjeta: el cliente elige en la terminal');
    assert(t.mp.guardar({ tarjetasPoint: false }).ok && !t.mp.estado().puedeTarjetas);
    const sinPoint = nuevo(() => resp(200, {})); sinPoint.mp.guardar({ token: TOKEN, tarjetasPoint: true }); assert(!sinPoint.mp.estado().puedeTarjetas, 'sin terminal Point no se activa'); }
  assert.strictEqual(interpretar(orden('failed', { status_detail: 'insufficient_amount' })).estado, 'rechazado', 'tarjeta rechazada');
  console.log('mercadopago OK');
})().catch(e => { console.error(e); process.exit(1); });
