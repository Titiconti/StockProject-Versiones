// v5.7: cobrar por importe ($4500 → kg) o por peso (kg → $), con coma decimal y sin flechitas; el total queda exacto y el stock se descuenta en gramos.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, f, db, errs } = web();
  const ev = w.eval.bind(w), toast = () => $('#toast').textContent, P = n => db().prods.find(p => p.name === n), kg = n => P(n).lots.reduce((a, l) => a + l.qty, 0);
  const nuevo = (nombre, precio, stock) => { tab('p'); click('#fx'); set('#fn', nombre); set('#fp', String(precio)); $('#px_u').value = 'kg'; $('#px_u').dispatchEvent(new w.Event('change', { bubbles: true })); set('#fs', stock); click('#fg'); };
  const abrir = n => { tab('v'); click(`#prods .p[data-id="${P(n).id}"]`); assert($('#pxm'), 'abre la ventana de peso'); };

  // ---- conversión de texto (coma decimal, miles con punto, símbolo $) ----
  assert.deepStrictEqual([ev("PX.num('4500')"), ev("PX.num('4.500,50')"), ev("PX.num('$ 4.500')"), ev("PX.num('1,125')"), ev("PX.num('abc')")].map(x => Number.isNaN(x) ? 'NaN' : x), [4500, 4500.5, 4500, 1.125, 'NaN']);

  // ---- importe → kg ----
  nuevo('Cebolla', 4000, '10'); abrir('Cebolla');
  assert.strictEqual($('#pxp').type, 'text'); assert.strictEqual($('#pxi').type, 'text', 'campos de texto, sin flechitas');
  set('#pxi', '4500'); assert.strictEqual($('#pxp').value, '1,125', 'calcula los kg'); assert(txt('#pxpt').includes(f(4500))); click('#pxok');
  assert.strictEqual(ev(`cart[${P('Cebolla').id}]`), 1125); assert(/1,125 kg/.test(txt('#cart')) && /por importe/.test(txt('#cart')));
  click('#cobrar'); let s = db().sales[0]; assert(s.total === 4500 && s.items[0].tot === 4500 && s.items[0].g === 1125 && s.items[0].qty === 1.125 && s.items[0].porImporte === true);
  assert.strictEqual(kg('Cebolla'), 8875, 'descuenta 1.125 g');

  // ---- kg → importe (con coma) ----
  abrir('Cebolla'); set('#pxp', '0,5'); assert.strictEqual($('#pxi').value, '2000', 'calcula el importe'); assert(txt('#pxpt').includes(f(2000))); click('#pxok');
  click('#cobrar'); s = db().sales[1]; assert(s.total === 2000 && s.items[0].g === 500 && !s.items[0].porImporte); assert.strictEqual(kg('Cebolla'), 8375);

  // ---- el total queda EXACTO aunque el peso redondeado no dé justo ----
  nuevo('Jamón', 3333.33, '5'); abrir('Jamón'); set('#pxi', '1000'); assert.strictEqual($('#pxp').value, '0,3'); click('#pxok');
  assert.strictEqual(ev(`cartTotal()`), 1000, '300 g a 3.333,33 son 999,999: se cobra lo escrito'); click('#cobrar'); s = db().sales[2]; assert(s.total === 1000 && s.items[0].g === 300);

  // ---- anular devuelve los gramos derivados ----
  tab('r'); click(`#hist [data-v="${db().sales[0].id}"]`); click(`#hist [data-v="${db().sales[0].id}"]`); assert(db().sales[0].void); assert.strictEqual(kg('Cebolla'), 8375 + 1125);

  // ---- avisos: sin stock, importe en cero, importe diminuto, texto inválido ----
  abrir('Jamón'); set('#pxi', '99999'); click('#pxok'); assert(/No hay tanto stock/.test(toast()) && $('#pxm'), 'importe mayor al stock');
  set('#pxi', 'abc'); click('#pxok'); assert(/importe con números/.test(toast()));
  set('#pxi', '5'); click('#pxok'); assert(/menos de 10 g/.test(toast())); click('#pxm [data-pxx]');
  assert.strictEqual(ev('cartTotal()'), 0);

  // ---- editar una línea cobrada por importe la vuelve a abrir con el importe; Enter confirma ----
  abrir('Cebolla'); set('#pxi', '1000'); $('#pxi').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); assert(!$('#pxm'), 'Enter confirma');
  click(`#cart [data-a="e"]`); assert.strictEqual($('#pxi').value, '1000'); set('#pxp', '2'); assert.strictEqual($('#pxi').value, '8000', 'al tocar el peso manda el peso'); click('#pxok');
  assert.strictEqual(ev(`cartImp[${P('Cebolla').id}]`), undefined); assert.strictEqual(ev('cartTotal()'), 8000);
  assert.strictEqual(require('../validar')(null, db()), null);
  assert.deepStrictEqual(errs, []); console.log('VENTA_PESO_IMPORTE_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
