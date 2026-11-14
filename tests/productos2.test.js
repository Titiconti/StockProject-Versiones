// v3.1: motor de precios, venta por peso, números de serie con garantía, variantes, tramos y mínimos.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, f, db, errs } = web();
  const ev = w.eval.bind(w), toast = () => $('#toast').textContent, P = id => db().prods.find(p => p.id === id);
  const nuevo = (nombre, precio, opts = {}) => { tab('p'); click('#fx'); set('#fn', nombre); set('#fp', String(precio)); for (const [k, v] of Object.entries(opts)) { if (k === '#px_vr') { $(k).checked = v; } else $(k).value = v; $(k).dispatchEvent(new w.Event('change', { bubbles: true })); } };

  // ---- precios: productos viejos no cambian; redondeo en centavos ----
  assert.strictEqual(ev('lineaTotal(db.prods[0],3)'), 8400); ev('setClient(1)'); assert.strictEqual(ev('precioUnit(db.prods.find(p=>p.id===5))'), 1485, '10 % de descuento'); ev('setClient(null)');

  // ---- por peso: precio por kg, stock en gramos ----
  nuevo('Jamón cocido', 12000, { '#px_u': 'kg' }); set('#fs', '2.5'); click('#fg');
  const jam = db().prods.find(p => p.name === 'Jamón cocido'); assert(jam.unidad === 'kg' && jam.lots[0].qty === 2500, 'guarda gramos enteros');
  assert.strictEqual(ev(`lineaTotal(db.prods.find(p=>p.id===${jam.id}),150)`), 1800, '150 g a 12.000/kg = 1.800');
  assert.strictEqual(ev(`lineaTotal(db.prods.find(p=>p.id===${jam.id}),333)`), 3996, 'redondeo a centavos');
  tab('v'); click(`#prods .p[data-id="${jam.id}"]`); assert($('#pxm'), 'pide el peso'); set('#pxp', '150'); $('#pxpu').value = 'g'; $('#pxpu').dispatchEvent(new w.Event('change'));
  assert(txt('#pxpt').includes(f(1800))); click('#pxok'); assert.strictEqual(ev(`cart[${jam.id}]`), 150); assert(/0,15 kg/.test(txt('#cart')));
  click(`#prods .p[data-id="${jam.id}"]`); set('#pxp', '9'); $('#pxpu').value = 'kg'; click('#pxok'); assert(/No hay tanto stock/.test(toast())); click('#pxm [data-pxx]');
  click('#cobrar'); let s = db().sales[0]; assert(s.total === 1800 && s.items[0].qty === 0.15 && s.items[0].g === 150 && s.items[0].tot === 1800); assert.strictEqual(P(jam.id).lots[0].qty, 2350);

  // ---- tramos y compra mínima ----
  nuevo('Caja de alfajores', 1000, { '#px_tr': '10=900; 50=800', '#px_min': '5' }); set('#fs', '100'); click('#fg');
  const alf = db().prods.find(p => p.name === 'Caja de alfajores'); assert.deepStrictEqual(alf.tramos, [{ desde: 10, precio: 900 }, { desde: 50, precio: 800 }]);
  const lt = q => ev(`lineaTotal(db.prods.find(p=>p.id===${alf.id}),${q})`); assert.deepStrictEqual([lt(9), lt(10), lt(49), lt(50)], [9000, 9000, 44100, 40000], 'límites entre tramos');
  nuevo('Malo', 1, { '#px_tr': '10=900; 10=800' }); click('#fg'); assert(/misma cantidad/.test(toast())); $('#px_tr').value = 'abc'; click('#fg'); assert(/formato/.test(toast()));
  tab('v'); ev(`cart[${alf.id}]=3;drawCart()`); click('#cobrar'); assert(/compra mínima es de 5/.test(toast())); assert.strictEqual(db().sales.length, 1);
  ev(`cart[${alf.id}]=10;drawCart()`); assert(/precio por cantidad/.test(txt('#cart'))); click('#cobrar'); assert.strictEqual(db().sales[1].total, 9000);

  // ---- vencimiento obligatorio ----
  nuevo('Yogur', 500, { '#px_vr': true }); set('#fs', '4'); click('#fg'); assert(/exige la fecha de vencimiento/.test(toast())); assert(!db().prods.some(p => p.name === 'Yogur'));
  $('#fv').value = ev('plus(20)'); click('#fg'); assert(db().prods.find(p => p.name === 'Yogur').reqVto);

  // ---- números de serie y garantía ----
  nuevo('Celular X', 100000, { '#px_ctl': 'serie', '#px_ga': '12' }); set('#fs', '2'); set('#fl', 'SN1'); click('#fg'); assert(/2 números de serie/.test(toast()));
  set('#fl', 'SN1, SN2'); click('#fg'); const cel = db().prods.find(p => p.name === 'Celular X'); assert.deepStrictEqual(cel.lots.map(l => [l.n, l.qty]), [['SN1', 1], ['SN2', 1]]);
  tab('i'); click(`#inv [data-l="${cel.id}"]`); set('#ln', 'sn2'); set('#lq', '1'); click('#lg'); assert(/ya está cargado/.test(toast()), 'serie repetida');
  tab('v'); click(`#prods .p[data-id="${cel.id}"]`); assert($('#pxl')); click('#pxsok'); assert.strictEqual(ev(`cart[${cel.id}]`), undefined, 'sin elegir no agrega');
  click(`#prods .p[data-id="${cel.id}"]`); $('#pxl [data-sl]').checked = true; click('#pxsok'); assert(/N.º SN1/.test(txt('#cart'))); click('#cobrar');
  s = db().sales[2]; assert.deepStrictEqual(s.items[0].series, ['SN1']); assert(s.items[0].garantiaHasta > ev('plus(300)')); assert.deepStrictEqual(P(cel.id).lots.map(l => l.n), ['SN2']);
  assert(ev("PX.agregarSerie('sn2')"), 'escanear una serie la agrega'); assert.strictEqual(ev(`cart[${cel.id}]`), 1); click('#vaciar');
  tab('i'); set('#pxg', 'sn1'); click('#pxgb'); assert(/Garantía hasta/.test(txt('#pxgr')) && /Vigente/.test(txt('#pxgr'))); set('#pxg', 'SN2'); click('#pxgb'); assert(/en stock/.test(txt('#pxgr')));

  // ---- variantes: stock independiente por combinación, sin duplicados ----
  nuevo('Remera básica', 8000, { '#px_ctl': 'variantes' }); click('#fg'); const rem = db().prods.find(p => p.name === 'Remera básica');
  tab('i'); click(`#inv [data-l="${rem.id}"]`); assert(!$('#pxv').classList.contains('hide')); const va = w.document.querySelectorAll('#pxva [data-va]'); va[0].value = 'S, M'; va[1].value = 'Negra, Blanca'; click('#pxvg');
  let H = db().prods.filter(p => p.padre === rem.id); assert.strictEqual(H.length, 4); va[0].value = 'S, L'; va[1].value = 'Negra'; click('#pxvg'); H = db().prods.filter(p => p.padre === rem.id); assert.strictEqual(H.length, 5, 'solo crea la que faltaba (L/Negra)');
  const ns = H.find(h => h.attrs.Talle === 'S' && h.attrs.Color === 'Negra'), bm = H.find(h => h.attrs.Talle === 'M' && h.attrs.Color === 'Blanca');
  ev(`db.prods.find(p=>p.id===${ns.id}).lots.push({id:db.lid++,n:'A',qty:5,exp:''});db.prods.find(p=>p.id===${bm.id}).lots.push({id:db.lid++,n:'A',qty:6,exp:''});draw()`);
  tab('v'); click(`#prods .p[data-id="${rem.id}"]`); assert(/S \/ Negra/.test(txt('#pxm'))); click(`#pxm [data-pv="${ns.id}"]`); click('#cobrar');
  assert.strictEqual(P(ns.id).lots[0].qty, 4); assert.strictEqual(P(bm.id).lots[0].qty, 6, 'la otra variante no cambia');
  tab('i'); click(`#inv [data-d="${rem.id}"]`); assert(/eliminá sus variantes/.test(toast())); assert(P(rem.id));

  // ---- no se cambia la forma de venta con stock ----
  tab('i'); click(`#inv [data-e="${jam.id}"]`); $('#px_u').value = 'u'; click('#fg'); assert(/No se puede cambiar la forma de venta/.test(toast())); assert.strictEqual(P(jam.id).unidad, 'kg');
  // ---- lo guardado pasa la validación del proceso principal ----
  assert.strictEqual(require('../validar')(null, db()), null);
  assert.deepStrictEqual(errs, []); console.log('PRODUCTOS2_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
