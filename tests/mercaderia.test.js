// Mercadería: recibir en un solo paso (stock, costo, vencimiento, series y forma de pago) y lista para pedir.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, tab, txt, f, db, errs } = web();
  const ev = w.eval.bind(w), toast = () => $('#toast').textContent, P = id => db().prods.find(p => p.id === id), stock = id => P(id).lots.reduce((a, l) => a + l.qty, 0);
  const pago = v => { const r = $(`[name="me_pg"][value="${v}"]`); r.checked = true; };
  const set = (sel, v) => { const i = $(sel); i.value = v; i.dispatchEvent(new w.Event('input', { bubbles: true })); i.dispatchEvent(new w.Event('change', { bubbles: true })); };
  tab('o'); assert(/Mercadería/.test(txt('nav button[data-t="o"]'))); assert(!$('#me_r').classList.contains('hide') && $('#me_lp').classList.contains('hide'));
  assert(w.getComputedStyle ? true : true); assert(w.document.body.classList.contains('simple') && /me-av/.test($('#me_t [data-me="a"]').className), 'los pedidos con seguimiento son avanzados');
  // escanear y buscar suman a la recepción
  ev("onScan('7790895')"); ev("onScan('7790895')"); assert.deepStrictEqual(ev('JSON.stringify(ME.items.map(i=>[i.id,i.q]))'), '[[1,1]]', 'una misma lectura repetida enseguida no suma dos veces');
  const q = $('#me_q'); q.value = 'leche'; q.dispatchEvent(new w.Event('input', { bubbles: true })); q.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.strictEqual(ev('ME.items.length'), 2);
  set('#me_l [data-q="1"]', '24'); set('#me_l [data-c="1"]', '1900'); set('#me_l [data-q="5"]', '12'); set('#me_l [data-c="5"]', '1250');
  assert(txt('#me_tot').includes(f(24 * 1900 + 12 * 1250)));
  // pagar con la caja: sin caja abierta no deja
  $('#me_pv').value = 'Distribuidora Sur'; pago('caja'); click('#me_ok'); assert(/No hay una caja abierta/.test(toast())); assert.strictEqual(stock(1), 24, 'no tocó el stock');
  ev('CJ.abrir(100000)'); const s1 = stock(1), s5 = stock(5); click('#me_ok');
  assert.strictEqual(stock(1), s1 + 24); assert.strictEqual(stock(5), s5 + 12); assert.strictEqual(P(5).cost, 1250, 'costo actualizado'); assert.strictEqual(P(1).cost, 1900);
  const c = db().cajas[0]; assert.strictEqual(c.movs.length, 1); assert(c.movs[0].monto === 60600 && c.movs[0].cat === 'Proveedor' && /Distribuidora Sur/.test(c.movs[0].motivo), 'salió de la caja como pago al proveedor');
  const r = db().recepciones[0]; assert(r.pago === 'caja' && r.total === 60600 && r.items.length === 2 && r.prov === 'Distribuidora Sur'); assert.strictEqual(ev('ME.items.length'), 0);
  assert(/Distribuidora Sur/.test(txt('#me_h'))); assert(db().ajustes.some(a => /recepción/.test(a.txt)), 'el cambio de costo queda en la actividad');
  // pagar más de lo que hay en la caja: no
  ev('ME.sumar(db.prods.find(p=>p.id===3))'); set('#me_l [data-q="3"]', '100'); set('#me_l [data-c="3"]', '5000'); click('#me_ok'); assert(/No hay tanto efectivo/.test(toast()));
  // le quedo debiendo: anota la deuda con el proveedor
  pago('deuda'); $('#me_pv').value = ''; click('#me_ok'); assert(/Escribí el proveedor/.test(toast())); $('#me_pv').value = 'Lácteos del Valle'; click('#me_ok');
  const g = db().fin.pagar.find(x => x.prov === 'Lácteos del Valle'); assert(g && g.monto === 500000 && !g.pagado); assert.strictEqual(db().cajas[0].movs.length, 1, 'no tocó la caja');
  const v = require('../validar')(null, db()); assert.strictEqual(v, null, 'lo guardado pasa la validación: ' + v);
  // otro medio: no toca caja ni deudas; vencimiento obligatorio
  ev("db.prods.find(p=>p.id===2).reqVto=true"); ev('ME.sumar(db.prods.find(p=>p.id===2))'); pago('otro'); click('#me_ok'); assert(/exige la fecha de vencimiento/.test(toast()));
  set('#me_l [data-x="2"]', ev('plus(40)')); const deudas = db().fin.pagar.length; click('#me_ok'); assert.strictEqual(db().fin.pagar.length, deudas); assert(P(2).lots.some(l => l.exp === ev('plus(40)')));
  // ---- lista para pedir ----
  click('#me_t [data-me="l"]'); assert(!$('#me_lp').classList.contains('hide'));
  assert(/Pan lactal/.test(txt('#me_ll')), 'el pan (sin stock) aparece'); assert(/Hola! Pedido de/.test(txt('#me_msg')) && /Pan lactal ×/.test(txt('#me_msg')));
  const chk = $('#me_ll [data-on="6"]'); chk.checked = false; chk.dispatchEvent(new w.Event('change', { bubbles: true })); assert(!/Pan lactal/.test(txt('#me_msg')), 'destildado no se pide');
  let abierto = ''; w.open = u => { abierto = u; }; chk.checked = true; chk.dispatchEvent(new w.Event('change', { bubbles: true }));
  set('#me_ll [data-lq="6"]', '30'); click('#me_wa'); assert(abierto.startsWith('https://wa.me/?text=') && decodeURIComponent(abierto).includes('Pan lactal × 30'));
  assert.deepStrictEqual(errs, []); console.log('MERCADERIA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
