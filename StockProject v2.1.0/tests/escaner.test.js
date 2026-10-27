const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const A = web(), { w, d, $, click, set, tab, txt, db, errs } = A;
  let t = 1e6; w.Date.now = () => t;      // reloj controlado: la pistola escribe en milisegundos, una persona no
  let scans = []; const orig = w.onScan; w.onScan = c => { scans.push(c); return orig(c); };
  const press = (el, key, o = {}) => { const e = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o }); el.dispatchEvent(e); return e; };
  // simula escribir un código en el campo enfocado: tecla por tecla y Enter; gap = milisegundos entre teclas
  const type = (code, gap, el = d.activeElement) => { if (el.focus) el.focus(); for (const ch of code) { t += gap; const e = press(el, ch); if (!e.defaultPrevented && 'value' in el) { el.value += ch; el.dispatchEvent(new w.Event('input', { bubbles: true })); } } t += gap; return press(el, 'Enter'); };
  const scan = (code, el) => type(code, 8, el);
  const toast = () => $('#toast').textContent;

  // ---- VENTAS: escanear agrega el producto aunque el cursor esté en el buscador ----
  $('#q').focus(); scan('7790895'); assert.deepStrictEqual(db === null, false);
  assert.strictEqual(w.eval('cart[1]'), 1, 'agregó Coca-Cola'); assert.strictEqual($('#q').value, '', 'el código no queda escrito en el buscador'); assert.deepStrictEqual(scans, ['7790895']);
  scan('7790895'); assert.strictEqual(w.eval('cart[1]'), 2, 'escanear de nuevo suma una unidad');
  // y también con el cursor fuera de cualquier campo
  d.activeElement.blur(); scan('7791234', d.body); assert.strictEqual(w.eval('cart[2]'), 1);
  // código desconocido
  scan('0000000000', $('#q')); assert(/no encontrado/.test(toast())); assert.strictEqual(Object.keys(w.eval('cart')).length, 2); assert.strictEqual($('#q').value, '');
  // sin stock
  scan('7794455', $('#q')); assert(/No hay más stock/.test(toast()), 'Pan lactal no tiene stock'); assert.strictEqual(w.eval('cart[6]'), undefined);
  // con un cliente elegido el escaneo usa su descuento
  w.eval('setClient(1)'); scan('7790387', $('#q')); assert.strictEqual(w.eval('cart[3]'), 1); assert(txt('#cart').includes(w.eval('fmt(6210)').replace(/[\s\u00a0]+/g, ' ')), '6900 con 10 % = 6210'); w.eval('setClient(null)');

  // ---- UNA PERSONA ESCRIBIENDO NO ES UN ESCANEO ----
  scans = []; click('#vaciar'); $('#q').focus();
  type('7790895', 180, $('#q')); assert.deepStrictEqual(scans, [], 'tipeo lento: no se toma como lector'); // (el Enter del buscador agrega el primero, como siempre)
  scans = []; $('#q').value = ''; scan('123', $('#q')); assert.deepStrictEqual(scans, [], 'menos de 4 caracteres no es un código'); assert.strictEqual(w.eval('cart[1]'), 1, 'el Enter normal del buscador sigue funcionando');
  scans = []; $('#q').value = ''; type('7790895', 8, $('#q')); // un código rápido pero con Ctrl apretado se ignora
  scans = []; { t += 8; press($('#q'), 'a', { ctrlKey: true }); t += 8; press($('#q'), 'Enter', { ctrlKey: true }); } assert.deepStrictEqual(scans, []);
  // pausa larga en medio: reinicia el código
  scans = []; $('#q').value = ''; { for (const ch of '77') { t += 8; press($('#q'), ch); } t += 500; for (const ch of '9089') { t += 8; press($('#q'), ch); } t += 8; press($('#q'), 'Enter'); } assert.deepStrictEqual(scans, ['9089'], 'una pausa larga reinicia el buffer');
  $('#q').value = '';

  // ---- PRODUCTOS: el código escaneado completa el campo Código ----
  tab('p'); w.eval('clr()'); $('#fn').focus(); scan('7799999999999', $('#fn'));
  assert.strictEqual($('#fc').value, '7799999999999', 'completa el código'); assert.strictEqual($('#fn').value, '', 'no ensucia el nombre'); assert(/Código leído/.test(toast()));
  assert.strictEqual(d.activeElement.id, 'fn', 'queda listo para escribir el nombre');
  $('#fn').value = 'Producto con código'; $('#fp').value = '500'; click('#fg'); assert.strictEqual(db().prods.find(p => p.name === 'Producto con código').code, '7799999999999', 'el producto nuevo queda con ese código');
  // si el código ya existe, abre el producto para sumarle stock
  w.eval('clr()'); scan('7793010', $('#fn')); assert.strictEqual($('#fn').value, 'Leche entera 1 L'); assert(/Agregar stock a: Leche/.test($('#ft').textContent), 'producto existente: modo sumar stock');
  // en modo edición, escanear asigna el código al producto (para productos que todavía no tienen)
  w.eval('clr()'); w.eval("pick(db.prods.find(p=>p.id===6))"); scan('7455000111222', $('#fs')); assert.strictEqual($('#fc').value, '7455000111222', 'asigna un código nuevo al producto editado'); assert.strictEqual($('#fs').value, '');
  w.eval('clr()');

  // ---- PEDIDOS y ESCUELA: elige el producto y pasa a la cantidad ----
  tab('o'); $('#op').focus(); scan('7792001', $('#op')); assert.strictEqual($('#op').value, 'Galletitas de agua'); assert.strictEqual(d.activeElement.id, 'oq');
  $('#oq').value = '5'; click('#oa'); assert(/Galletitas de agua/.test(txt('#od')) && />5</.test($('#od').innerHTML));
  tab('e'); $('#ep').focus(); scan('7790895', $('#ep')); assert.strictEqual($('#ep').value, 'Coca-Cola 1,5 L'); assert.strictEqual(d.activeElement.id, 'eq');
  scan('9999999999', $('#eq')); assert(/no encontrado/.test(toast()), 'código desconocido en Escuela'); assert.strictEqual($('#eq').value, '', 'tampoco ensucia la cantidad');
  // ---- INVENTARIO / otras pestañas: muestra los datos del producto ----
  tab('i'); scan('7791234', d.body); assert(/Agua mineral 500 ml · stock 40/.test(toast()));
  tab('c'); scan('7791234', d.body); assert(/Agua mineral/.test(toast()));
  // ---- lo escrito en un campo no se mezcla con el código escaneado en el campo siguiente (aunque pase muy poco tiempo) ----
  tab('e'); scans = []; { const el = $('#en'); el.focus(); for (const ch of 'Copa de leche') { t += 20; press(el, ch); el.value += ch; } }   // texto tecleado rápido, sin Enter
  scan('7793010', $('#ep'));
  assert.deepStrictEqual(scans, ['7793010'], 'solo el código, sin la nota anterior'); assert.strictEqual($('#ep').value, 'Leche entera 1 L'); assert.strictEqual($('#en').value, 'Copa de leche', 'la nota queda intacta');
  assert.deepStrictEqual(errs, []); console.log('ESCANER_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
