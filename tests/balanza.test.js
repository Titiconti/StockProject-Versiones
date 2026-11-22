// v5.7: etiquetas de balanza EAN-13 (prefijo 2): dígito verificador, varias plantillas, asistente y venta por lectura.
const assert = require('assert'), { web } = require('./helpers');
// Dígito verificador de EAN-13 calculado acá, independiente del programa.
const dv = c12 => { let s = 0; for (let i = 0; i < 12; i++) s += +c12[i] * (i % 2 ? 3 : 1); return (10 - s % 10) % 10; };
const ean = c12 => c12 + dv(c12);
(async () => {
  const { w, $, click, set, tab, txt, f, db, errs } = web();
  const ev = w.eval.bind(w), toast = () => $('#toast').textContent, P = n => db().prods.find(p => p.name === n), kg = n => P(n).lots.reduce((a, l) => a + l.qty, 0);
  const J = c => JSON.parse(ev('JSON.stringify(' + c + ')'));
  const dec = (code, t) => J(`BZ.decodificar('${code}',${JSON.stringify(t)})`);

  // ---- dígito de control ----
  assert.strictEqual(ev("BZ.digito('400638133393')"), 1, 'EAN conocido 4006381333931'); assert(ev("BZ.valido('4006381333931')") && !ev("BZ.valido('4006381333932')"));
  assert.strictEqual(dv('400638133393'), 1);

  // ---- varias plantillas ----
  const A = { iPlu: 1, nPlu: 6, iVal: 7, nVal: 5, tipo: 'importe', dec: 0 };               // 2 PPPPPP VVVVV C
  const B = { iPlu: 1, nPlu: 5, iVal: 7, nVal: 5, tipo: 'importe', dec: 2 };               // 2 PPPPP x VVVVV C (un dígito interno que se ignora; importe con centavos)
  const C = { iPlu: 2, nPlu: 5, iVal: 7, nVal: 5, tipo: 'peso', dec: 3 };                  // 2x PPPPP VVVVV C (peso en gramos)
  const D = { iPlu: 1, nPlu: 4, iVal: 5, nVal: 7, tipo: 'importe', dec: 0 };               // PLU corto y valor largo (carne, importes grandes)
  assert.deepStrictEqual(dec(ean('2' + '000123' + '04500'), A), { plu: '123', valor: 4500, tipo: 'importe' }, 'PLU sin ceros y importe');
  assert.deepStrictEqual(dec(ean('2' + '00123' + '9' + '04550'), B), { plu: '123', valor: 45.5, tipo: 'importe' }, 'importe con centavos');
  assert.deepStrictEqual(dec(ean('20' + '12345' + '01125'), C), { plu: '12345', valor: 1.125, tipo: 'peso' }, 'peso en kg desde gramos');
  assert.deepStrictEqual(dec(ean('2' + '0042' + '0123456'), D), { plu: '42', valor: 123456, tipo: 'importe' });
  // una misma etiqueta da cosas distintas según la plantilla: por eso se configura
  assert.notDeepStrictEqual(dec(ean('2' + '000123' + '04500'), C), dec(ean('2' + '000123' + '04500'), A));
  // errores: dígito de control, prefijo, largo, plantilla mala
  const buena = ean('2' + '000123' + '04500'), mala = buena.slice(0, 12) + ((+buena[12] + 1) % 10);
  assert(/dígito de control/.test(dec(mala, A).err), 'dígito de control incorrecto'); assert(/No es una etiqueta/.test(dec('7790895000010', A).err) && /No es una etiqueta/.test(dec('2123', A).err));
  assert(/Falta configurar/.test(J("BZ.decodificar('" + buena + "',null)").err)); assert(/se sale de la etiqueta/.test(dec(buena, { ...A, iVal: 8 }).err), 'el último dígito es de control');
  assert(/pisarse/.test(dec(buena, { ...A, iVal: 5 }).err)); assert(dec(buena, { ...A, tipo: 'otro' }).err); assert(dec(buena, { ...A, dec: 5 }).err);

  // ---- asistente: deduce la plantilla desde una etiqueta real ----
  const cumple = (code, plu, valor, r) => { assert(r.plantillas && r.plantillas.length, JSON.stringify(r)); r.plantillas.forEach(t => { const d = dec(code, t); assert(d.plu === plu && Math.abs(d.valor - valor) < 1e-9, 'toda plantilla propuesta decodifica bien: ' + JSON.stringify(t)); }); };
  let code = ean('2' + '000123' + '04500'), r = J(`BZ.deducir('${code}','123','4500','importe')`); cumple(code, '123', 4500, r); assert.deepStrictEqual(r.plantillas[0], A, 'la más probable es la de siempre'); assert.strictEqual(r.controlOk, true);
  code = ean('20' + '12345' + '01125'); r = J(`BZ.deducir('${code}','12345','1,125','peso')`); cumple(code, '12345', 1.125, r); assert(r.plantillas.some(t => JSON.stringify(t) === JSON.stringify(C)), 'incluye la plantilla real de peso');
  code = ean('2' + '00123' + '9' + '04550'); r = J(`BZ.deducir('${code}','123','45,50','importe')`); cumple(code, '123', 45.5, r); assert(r.plantillas.some(t => JSON.stringify(t) === JSON.stringify(B)), 'importe con 2 decimales');
  assert(/No encontré/.test(J(`BZ.deducir('${code}','999','45,50','importe')`).err)); assert(/N.º de producto/.test(J(`BZ.deducir('${code}','','45,50','importe')`).err)); assert(J(`BZ.deducir('1234','1','1','peso')`).err);
  assert.strictEqual(J(`BZ.deducir('${code.slice(0, 12)}${(+code[12] + 1) % 10}','123','45,50','importe')`).controlOk, false, 'avisa si la etiqueta se leyó mal');

  // ---- productos: código de balanza único ----
  const nuevo = (nombre, precio, stock, plu) => { tab('p'); click('#fx'); set('#fn', nombre); set('#fp', String(precio)); $('#px_u').value = 'kg'; $('#px_u').dispatchEvent(new w.Event('change', { bubbles: true })); set('#px_plu', plu); set('#fs', stock); click('#fg'); };
  nuevo('Cebolla', 1000, '20', '00123'); assert.strictEqual(P('Cebolla').plu, '123', 'guarda el PLU sin ceros');
  nuevo('Papa', 800, '20', '123'); assert(/ya lo usa Cebolla/.test(toast()) && !P('Papa'), 'PLU repetido'); set('#px_plu', 'ab'); click('#fg'); assert(/solo números/.test(toast()));
  set('#px_plu', '55'); click('#fg'); assert.strictEqual(P('Papa').plu, '55');

  // ---- configuración con el asistente de la pantalla ----
  code = ean('2' + '000123' + '04500'); set('#bz_et', code); set('#bz_pl', '123'); set('#bz_vl', '4500'); click('#bz_de'); assert($('#bz_cand [data-bzc]'), 'ofrece plantillas'); assert.strictEqual($('#bz_ip').value, '2'); assert.strictEqual($('#bz_np').value, '6');
  click('#bz_gu'); assert.deepStrictEqual(JSON.parse(JSON.stringify(db().cfg.balanza)), A, 'guarda la plantilla');
  set('#bz_pr', code); assert(/Producto N.º 123 \(Cebolla\)/.test(txt('#bz_rs')) && txt('#bz_rs').includes(f(4500)), 'probar etiqueta');
  set('#bz_ip', '9'); click('#bz_gu'); assert(/se sale|pisarse|inválidos/.test(toast()), 'no guarda una plantilla mala');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(db().cfg.balanza)), A);

  // ---- venta: leer la etiqueta agrega el producto por importe y descuenta kg ----
  tab('v'); ev(`onScan('${code}')`); const id = P('Cebolla').id;
  assert.strictEqual(ev(`cart[${id}]`), 4500, '4500 a $1000/kg = 4,5 kg'); assert.strictEqual(ev('cartTotal()'), 4500); assert(/4,5 kg/.test(txt('#cart')));
  // otra etiqueta del mismo producto, de peso: se suma
  db(); ev(`BZ.agregar(db.prods.find(p=>p.id===${id}),500,null)`); assert.strictEqual(ev(`cart[${id}]`), 5000); assert.strictEqual(ev('cartTotal()'), 5000);
  click('#cobrar'); const s = db().sales[0]; assert(s.total === 5000 && s.items[0].g === 5000 && s.items[0].porImporte === true); assert.strictEqual(kg('Cebolla'), 15000, 'descuenta en kg');
  // etiqueta de peso (plantilla de peso)
  ev(`db.cfg.balanza=${JSON.stringify({ iPlu: 2, nPlu: 5, iVal: 7, nVal: 5, tipo: 'peso', dec: 3 })}`); ev(`db.prods.find(p=>p.id===${id}).plu='12345'`);
  ev(`onScan('${ean('20' + '12345' + '01125')}')`); assert.strictEqual(ev(`cart[${id}]`), 1125); assert.strictEqual(ev('cartTotal()'), 1125, '1,125 kg a $1000');
  click('#cobrar'); assert(db().sales[1].total === 1125 && !db().sales[1].items[0].porImporte && kg('Cebolla') === 13875);
  // avisos: PLU inexistente, dígito de control, stock insuficiente, no es etiqueta
  ev(`onScan('${ean('20' + '99999' + '01125')}')`); assert(/ningún producto por peso tiene el código de balanza 99999/.test(toast()));
  const e2 = ean('20' + '12345' + '01125'); ev(`onScan('${e2.slice(0, 12)}${(+e2[12] + 1) % 10}')`); assert(/dígito de control/.test(toast()));
  ev(`onScan('${ean('20' + '12345' + '99999')}')`); assert(/No hay tanto stock/.test(toast()) && ev('cartTotal()') === 0, 'no agrega más de lo que hay');
  // escribir la etiqueta en el buscador y Enter también funciona
  set('#q', e2); $('#q').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); assert.strictEqual(ev(`cart[${id}]`), 1125); assert.strictEqual($('#q').value, '');
  click('#vaciar');
  // un producto común cuyo código empieza con 2 sigue funcionando
  ev("db.prods.push({id:db.nid++,name:'Raro',code:'2000000000008',price:10,cost:0,min:0,lots:[{id:db.lid++,n:'a',qty:5,exp:''}]});draw()"); ev("onScan('2000000000008')"); assert.strictEqual(ev(`cart[db.prods.find(p=>p.name==='Raro').id]`), 1);
  assert.strictEqual(require('../validar')(null, db()), null);
  assert.deepStrictEqual(errs, []); console.log('BALANZA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
