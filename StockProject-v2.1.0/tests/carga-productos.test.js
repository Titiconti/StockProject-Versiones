// Cargar el catálogo desde cero con la pistola: escanear -> escribir -> Enter -> Enter ... -> se guarda -> escanear el siguiente.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const A = web(), { w, d, $, click, set, tab, db, errs } = A;
  w.eval('db.prods=[];db.clients=[];save();draw()');             // instalación nueva: sin productos
  let t = 1e6; w.Date.now = () => t;
  const press = (el, key, o = {}) => { const e = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o }); el.dispatchEvent(e); return e; };
  const scan = code => { const el = d.activeElement && d.activeElement !== d.body ? d.activeElement : d.body; for (const ch of code) { t += 8; const e = press(el, ch); if (!e.defaultPrevented && 'value' in el) { el.value += ch; el.dispatchEvent(new w.Event('input', { bubbles: true })); } } t += 8; press(el, 'Enter'); };
  const enter = id => { t += 500; return press($('#' + id), 'Enter'); };
  const foco = () => d.activeElement.id;
  const prod = n => db().prods.find(p => p.name === n);
  const toast = () => $('#toast').textContent;

  tab('p');
  // ---- 1.er producto: sin tocar el mouse ----
  scan('7791111111111');                                          // el cursor no está en ningún campo
  assert.strictEqual($('#fc').value, '7791111111111', 'completó el campo Código'); assert.strictEqual(foco(), 'fn', 'pasa al nombre'); assert(/Código leído/.test(toast()));
  set('#fn', 'Fideos 500 g'); enter('fn'); assert.strictEqual(foco(), 'fp', 'Enter en el nombre -> precio');
  set('#fp', '1500'); enter('fp'); assert.strictEqual(foco(), 'fk'); set('#fk', '900'); enter('fk'); assert.strictEqual(foco(), 'fm');
  set('#fm', '5'); enter('fm'); assert.strictEqual(foco(), 'fs'); set('#fs', '40'); enter('fs'); assert.strictEqual(foco(), 'fl'); enter('fl'); assert.strictEqual(foco(), 'fv');
  set('#fv', '2027-01-31'); assert.strictEqual(db().prods.length, 0, 'todavía no se guardó'); enter('fv');
  const p1 = prod('Fideos 500 g'); assert(p1 && p1.code === '7791111111111' && p1.price === 1500 && p1.cost === 900 && p1.min === 5, 'guardado con todos sus datos');
  assert.deepStrictEqual(p1.lots.map(l => [l.qty, l.exp]), [[40, '2027-01-31']]);
  assert.strictEqual(foco(), 'fc', 'queda listo para escanear el siguiente'); assert.strictEqual($('#fc').value, '', 'formulario limpio'); assert.strictEqual($('#fn').value, '');
  assert(/Último guardado: Fideos 500 g · 7791111111111/.test($('#flast').textContent));

  // ---- 2.º producto: con el cursor ya en el campo Código; guardado con Ctrl+Enter ----
  scan('7792222222222'); assert.strictEqual($('#fc').value, '7792222222222', 'el código queda una sola vez, sin duplicar lo tipeado'); assert.strictEqual(foco(), 'fn');
  set('#fn', 'Arroz 1 kg'); set('#fp', '2100'); $('#fp').focus(); press($('#fp'), 'Enter', { ctrlKey: true });
  const p2 = prod('Arroz 1 kg'); assert(p2 && p2.code === '7792222222222' && p2.price === 2100 && p2.cost === 0 && p2.lots.length === 0, 'Ctrl+Enter guarda de inmediato (sin stock ni costo)');
  assert.strictEqual(foco(), 'fc');

  // ---- 3.er producto: escribir el código a mano y recorrer con Enter ----
  set('#fc', '7793333333333'); enter('fc'); assert.strictEqual(foco(), 'fn'); set('#fn', 'Aceite 900 ml'); set('#fp', '3000'); $('#fp').focus(); press($('#fp'), 'Enter', { ctrlKey: true }); assert(prod('Aceite 900 ml'));

  // ---- códigos repetidos ----
  tab('p'); scan('7791111111111');                                // código que ya existe -> abre el producto para sumar stock
  assert.strictEqual($('#fn').value, 'Fideos 500 g'); assert(/Agregar stock a: Fideos 500 g \(stock actual: 40\)/.test($('#ft').textContent), 'producto existente: modo sumar stock'); assert(/Producto existente/.test(toast()));
  set('#fs', '10'); enter('fs'); enter('fl'); enter('fv');        // cantidad -> lote -> vencimiento -> guarda
  assert.strictEqual(prod('Fideos 500 g').lots.reduce((a, l) => a + l.qty, 0), 50, 'sumó 10 unidades'); assert.strictEqual(db().prods.length, 3, 'no creó un producto duplicado'); assert.strictEqual(foco(), 'fc');
  // editando un producto, escanear el código de OTRO no lo asigna
  w.eval("pick(db.prods.find(p=>p.name==='Arroz 1 kg'))"); const antes = $('#fc').value; scan('7791111111111');
  assert(/ya pertenece a Fideos 500 g/.test(toast()), toast()); assert.strictEqual($('#fc').value, antes, 'no se pisa el código'); assert.strictEqual($('#fs').value, '', 'ni se ensucia el campo donde estaba el cursor'); w.eval('clr()');
  // escribir a mano un código repetido: no deja guardar
  tab('p'); set('#fn', 'Otro producto'); set('#fp', '10'); set('#fc', '7792222222222'); click('#fg'); assert(/ya lo tiene Arroz 1 kg/.test(toast()), toast()); assert(!prod('Otro producto'));
  set('#fc', '7794444444444'); click('#fg'); assert(prod('Otro producto'), 'con un código distinto sí');
  // editar un producto conservando su propio código no se confunde con un duplicado
  w.eval("pick(db.prods.find(p=>p.name==='Arroz 1 kg'))"); $('#fp').value = '2200'; click('#fg'); assert.strictEqual(prod('Arroz 1 kg').price, 2200);
  // el mismo flujo sigue sirviendo al editar desde el inventario (vuelve a Inventario)
  tab('i'); click([...w.document.querySelectorAll('#inv tr')].find(tr => /Aceite/.test(tr.textContent)).querySelector('[data-e]')); assert(!$('#p').classList.contains('hide'));
  $('#fp').value = '3100'; press($('#fp'), 'Enter', { ctrlKey: true }); assert.strictEqual(prod('Aceite 900 ml').price, 3100); assert(!$('#i').classList.contains('hide'), 'vuelve a Inventario');
  assert.deepStrictEqual(errs, []); console.log('CARGA_PRODUCTOS_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
