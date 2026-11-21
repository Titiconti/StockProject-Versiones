// Cobro con Mercado Pago en la pantalla de Ventas (el proceso principal está simulado: no se llama a Mercado Pago).
const assert = require('assert'), { JSDOM, HTML, until, api } = require('./helpers.js');
(async () => {
  const guardado = []; let respuestas = [], llamadas = [];
  const est = { configurado: true, modo: 'prueba', posQr: 'CAJA1', terminalId: 'T1', fin: '9999', puedeQr: true, puedePoint: true };
  const pago = { orden: 'ORD1', pago: 'PAY1', ref: '555', ext: 'REF', monto: 0 };
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, beforeParse(w) {
    w.sp = { load: () => '', save: async d => { guardado.push(JSON.parse(d)); return { ok: true, rev: guardado.length }; }, version: () => 0, defaults: () => ({}), info: async () => ({ dir: 'x', last: null, warn: '' }), now: async () => ({}), print: async () => ({ ok: true }),
      auth: { estado: () => ({ habilitado: false }), call: async () => [], ir: async () => true, login: async () => ({}), logout: async () => ({}) },
      mp: { estado: async () => est, cobrar: async a => { llamadas.push(['cobrar', a]); return { ok: true, orden: 'ORD1', medio: a.medio, modo: 'prueba', qrSvg: a.medio === 'qr' ? '<svg xmlns="http://www.w3.org/2000/svg"/>' : undefined }; },
        consultar: async o => { llamadas.push(['consultar', o]); const r = respuestas.shift() || { ok: true, estado: 'pendiente' }; return r.estado === 'aprobado' ? { ...r, pago: { ...pago, monto: r.monto } } : r; },
        cancelar: async o => { llamadas.push(['cancelar', o]); return { ok: true, estado: 'cancelado' }; }, conciliar: async d => ({ ok: true, dia: d, pagos: 2, coinciden: [], diferencias: [{ venta: 1, total: 10, monto: 12, motivo: 'El monto cobrado es distinto al de la venta' }], ventasSinPago: [], pagosSinVenta: [{ pago: '9', monto: 5 }] }) } };
  } });
  const A = { ...api(dom.window), w: dom.window }, ev = A.w.eval.bind(A.w), $ = A.$;
  ev('MP.INT=20;MP.MAX=400;db.cfg.cajaObligatoria=false;db.sales=[];db.prods=[{id:1,name:"Yerba",price:1500,cost:900,lots:[{id:1,n:"L1",qty:100}]}];draw()');
  assert(await until(() => [...$('#pay').options].some(o => o.value === 'Mercado Pago QR') && [...$('#pay').options].some(o => o.value === 'Mercado Pago Point')), 'aparecen los medios de pago de Mercado Pago');
  const cargar = () => { ev('cart={};cartSer={}'); ev('add(db.prods[0].id)'); return ev('cartTotal()'); };
  const total = cargar(); assert(total > 0);

  // 1) QR aprobado: la venta se registra una sola vez, con el medio y el id de pago
  respuestas = [{ ok: true, estado: 'pendiente' }, { ok: true, estado: 'aprobado', monto: total }];
  A.set('#pay', 'Mercado Pago QR'); A.click('#cobrar');
  assert(await until(() => $('#mpov') && $('#mpqr img')), 'muestra el QR'); assert(/Modo prueba/.test(A.txt('#mpov')), 'avisa que es modo prueba'); assert.strictEqual(ev('db.sales.length'), 0, 'mientras espera no hay venta');
  assert(await until(() => ev('db.sales.length') === 1), 'al aprobarse se registra'); assert(!$('#mpov'));
  let s = A.db().sales[0]; assert.strictEqual(s.pay, 'Mercado Pago QR'); assert.strictEqual(s.mp.pago, 'PAY1'); assert(!('medio' in s.mp)); assert.strictEqual(s.total, total);
  await new Promise(r => setTimeout(r, 120)); assert.strictEqual(ev('db.sales.length'), 1, 'no se registra dos veces'); assert.strictEqual(llamadas.filter(l => l[0] === 'cobrar').length, 1, 'se cobra una sola vez');

  assert.strictEqual(ev("PL.calc().ent['Mercado Pago']"), total, 'Resumen financiero: Mercado Pago es un medio propio'); assert.strictEqual(ev("PL.calc().ent.Otros"), 0);
  assert.strictEqual(ev("JSON.stringify(CJ.calc({id:db.sales[0].caja,ini:0,movs:[]}).porMedio)"), JSON.stringify({ 'Mercado Pago': total }), 'la caja lo agrupa como Mercado Pago');

  // 2) El mismo pago no se puede usar en otra venta
  cargar(); respuestas = [{ ok: true, estado: 'aprobado', monto: ev('cartTotal()') }]; A.click('#cobrar');
  assert(await until(() => /ya estaba registrado/.test(A.txt('#toast')))); assert.strictEqual(ev('db.sales.length'), 1);

  // 3) Rechazado / sin conexión: no se registra y se puede elegir otro medio
  ev('cart={};cartSer={}'); cargar(); respuestas = [{ ok: true, estado: 'rechazado', msg: 'Mercado Pago rechazó el pago: fondos insuficientes' }]; A.click('#cobrar');
  assert(await until(() => /rechazó/.test(A.txt('#toast')) && !$('#mpov'))); assert.strictEqual(ev('db.sales.length'), 1); assert(ev('Object.keys(cart).length') > 0, 'el carrito sigue');
  respuestas = [{ ok: false, red: true, err: 'No hay conexión con Mercado Pago' }, { ok: true, estado: 'pendiente' }]; A.click('#cobrar');
  assert(await until(() => /No hay conexión/.test(A.txt('#mpmsg')))); assert.strictEqual(ev('db.sales.length'), 1, 'sin internet no se cobra');

  // 4) Cancelar con el botón
  A.click('#mpx'); assert(await until(() => !$('#mpov') && llamadas.some(l => l[0] === 'cancelar'))); assert.strictEqual(ev('db.sales.length'), 1);

  // 5) Tiempo máximo: cancela solo
  llamadas = []; respuestas = []; A.click('#cobrar'); assert(await until(() => llamadas.some(l => l[0] === 'cancelar'), 3000), 'a los MAX ms cancela'); assert(await until(() => !$('#mpov'))); assert.strictEqual(ev('db.sales.length'), 1);

  // 6) Point con efectivo intacto: cobrar en efectivo no toca Mercado Pago
  llamadas = []; A.set('#pay', 'Efectivo'); A.click('#cobrar'); assert(await until(() => ev('db.sales.length') === 2)); assert(!llamadas.length && !A.db().sales[1].mp);

  // 7) Conciliar muestra las diferencias
  A.tab('g'); ev('CF.sub="n"'); const det = $('#mpc'); assert(det, 'sección de Mercado Pago en Configuración'); A.click('#mp_cc');
  assert(await until(() => /Diferencias \(1\)/.test(A.txt('#mp_r')) && /sin venta/.test(A.txt('#mp_r'))), A.txt('#mp_r'));
  assert(!/9999|TEST-/.test(A.txt('#mpc')) || /terminado en 9999/.test(A.txt('#mp_e')));
  assert.deepStrictEqual(A.errs, [], 'sin errores en la página');
  console.log('mercadopago-ui OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
