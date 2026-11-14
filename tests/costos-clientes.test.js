const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const A = web(), { w, $, click, set, pick, tab, txt, f, db, errs } = A;
  // ---------- COSTO POR PRODUCTO ----------
  tab('p'); set('#fn', 'coca'); pick('#sg');
  assert.strictEqual($('#fk').value, '1900', 'el costo se carga al elegir el producto');
  $('#fk').value = '2000'; click('#fg');
  assert.strictEqual(db().prods.find(p => p.id === 1).cost, 2000);
  tab('i'); assert(/29 %/.test(txt('#inv')), 'margen (2800-2000)/2800 = 29 %'); assert(txt('#inv').includes(f(2000)));
  tab('p'); set('#fn', 'Alfajor Triple'); $('#fp').value = '900'; $('#fk').value = '500'; $('#fm').value = '2'; $('#fs').value = '30'; click('#fg');
  assert.strictEqual(db().prods.find(p => p.name === 'Alfajor Triple').cost, 500);
  // el costo no puede ser negativo
  tab('p'); set('#fn', 'Gratis'); $('#fp').value = '10'; $('#fk').value = '-5'; click('#fg'); assert.strictEqual(db().prods.find(p => p.name === 'Gratis').cost, 0);

  // ---------- CLIENTES ----------
  tab('c');
  $('#cn').value = 'Kiosco 33'; $('#cp').value = '341 000'; $('#cd').value = '33.3'; click('#cg');
  let c33 = db().clients.find(c => c.name === 'Kiosco 33'); assert(c33 && c33.disc === 33.3 && c33.phone === '341 000');
  $('#cn').value = 'kiosco 33'; click('#cg'); assert(/ya existe/i.test($('#toast').textContent)); assert.strictEqual(db().clients.length, 3, 'sin duplicados');
  $('#cn').value = 'Abusivo'; $('#cd').value = '500'; click('#cg'); assert.strictEqual(db().clients.find(c => c.name === 'Abusivo').disc, 100, 'descuento máximo 100 %');
  $('#cn').value = 'Negativo'; $('#cd').value = '-20'; click('#cg'); assert.strictEqual(db().clients.find(c => c.name === 'Negativo').disc, 0, 'descuento mínimo 0 %');
  assert(/Kiosco La Esquina/.test(txt('#cli')) && /Sin deuda/.test(txt('#cli')));

  // ---------- VENTA PARTICULAR vs VENTA A UN CLIENTE ----------
  tab('v');
  assert($('#occ').hidden && $('#occ').disabled, 'sin cliente no hay cuenta corriente');
  click('#prods .p'); assert(txt('#total').includes(f(2800)), 'venta particular: precio de lista');
  set('#pay', 'Efectivo'); click('#cobrar'); let s0 = db().sales[0]; assert(!s0.cid && !s0.disc && s0.items[0].price === 2800 && s0.items[0].cost === 2000, 'particular: sin cliente, costo guardado');
  set('#cl', 'esquina'); pick('#clg');
  assert(/Kiosco La Esquina · 10% de descuento/.test(txt('#clchip')), 'chip con el descuento'); assert(!$('#occ').hidden && !$('#occ').disabled, 'con cliente se habilita la cuenta corriente');
  click('#prods .p'); click('#prods .p');
  assert(txt('#cart').includes(f(2520)) && txt('#cart').includes(f(2800)), 'precio con descuento y precio de lista tachado'); assert(txt('#total').includes(f(5040)), '2 x 2800 con 10 % = 5040');
  assert(txt('#prods').includes(f(2520)), 'las tarjetas muestran el precio con descuento');
  set('#pay', 'Cuenta corriente'); $('#prt').checked = true; click('#cobrar');
  const sale = db().sales[1];
  assert.strictEqual(sale.cid, 1); assert.strictEqual(sale.cname, 'Kiosco La Esquina'); assert.strictEqual(sale.disc, 10); assert.strictEqual(sale.pay, 'Cuenta corriente'); assert.strictEqual(sale.total, 5040);
  assert.deepStrictEqual([sale.items[0].price, sale.items[0].lp, sale.items[0].cost, sale.items[0].qty], [2520, 2800, 2000, 2]);
  assert.strictEqual(db().prods.find(p => p.id === 1).lots.reduce((a, l) => a + l.qty, 0), 24 - 3, 'descontó el stock');
  assert(!$('#pv').classList.contains('hide') && /Cliente: Kiosco La Esquina/.test(txt('#pvb')) && /Descuento aplicado: 10 %/.test(txt('#pvb')), 'ticket con cliente y descuento'); click('#pvc');
  assert.strictEqual($('#cl').value, '', 'después de cobrar vuelve a venta particular'); assert(!/Kiosco/.test(txt('#clchip')));
  // cuenta corriente sin cliente: bloqueado
  click('#prods .p'); w.eval("$('#occ').hidden=false;$('#occ').disabled=false"); $('#pay').value = 'Cuenta corriente'; click('#cobrar'); assert(/Elegí un cliente/.test($('#toast').textContent)); assert.strictEqual(db().sales.length, 2); click('#vaciar');
  // redondeo de centavos con 33,3 % sobre 1650 (Leche)
  set('#cl', 'kiosco 33'); pick('#clg'); const leche = [...w.document.querySelectorAll('#prods .p')].find(b => /Leche/.test(b.textContent)); click(leche);
  assert(txt('#total').includes(f(1100.55)), '1650 con 33,3 % = 1100,55'); click('#cobrar'); assert.strictEqual(db().sales[2].total, 1100.55);

  // ---------- DEUDA Y PAGOS ----------
  tab('c'); assert(txt('#cli').includes(f(5040)), 'deuda del cliente'); assert(/Deuda total de los clientes: \$ 5\.040,00/.test(txt('#clsum')), 'deuda total');
  const mBtn = [...w.document.querySelectorAll('#cli [data-m]')][0]; click(mBtn);
  assert(!$('#cdet').classList.contains('hide') && $('#cm').value === '5040.00', 'monto sugerido = deuda');
  $('#cm').value = '2000'; $('#cmm').value = 'Transferencia'; $('#cnn').value = 'adelanto'; click('#cpay');
  assert.strictEqual(w.eval('debtOf(1)'), 3040); assert(/Pago \(Transferencia\) · adelanto/.test(txt('#cmv'))); assert(txt('#cmv').includes(f(3040)), 'saldo corrido');
  $('#cm').value = '4000'; click('#cpay'); assert.strictEqual(w.eval('debtOf(1)'), -960); assert(/A favor/.test(txt('#cli')), 'saldo a favor');
  $('#cm').value = '0'; click('#cpay'); assert(/monto/i.test($('#toast').textContent)); assert.strictEqual(db().pays.length, 2);
  const del = () => [...w.document.querySelectorAll('#cmv [data-p]')][0]; click(del()); assert.strictEqual(db().pays.length, 2, 'anular pide confirmación'); click(del()); assert.strictEqual(db().pays.length, 1); assert.strictEqual(w.eval('debtOf(1)'), 3040);

  // ---------- RENTABILIDAD POR CLIENTE ----------
  // Kiosco La Esquina: vendió 2 Coca a 2520 con costo 2000 -> ganancia 1040 sobre 5040 = 20,6 %
  assert(/20,6 %/.test(txt('#cli')) && txt('#cli').includes(f(1040)), 'rentabilidad del cliente: ' + txt('#cli'));
  assert(/Rentabilidad: 20,6 %/.test(txt('#cds')));

  // ---------- ANULAR / CORREGIR una venta de cliente ----------
  tab('r'); $('#per').value = '9999'; w.eval("$('#per').dispatchEvent(new Event('change'))");
  const hist = a => [...w.document.querySelectorAll('#hist [data-' + a + ']')];
  assert(/Kiosco La Esquina/.test(txt('#hist')), 'el historial muestra el cliente');
  const idx = db().sales.findIndex(s => s.cid === 1), id1 = db().sales[idx].id;
  const stockAntes = db().prods.find(p => p.id === 1).lots.reduce((a, l) => a + l.qty, 0);
  const row = a => [...w.document.querySelectorAll('#hist tr')].find(tr => /Kiosco La Esquina/.test(tr.textContent)).querySelector('[data-' + a + ']');
  click(row('c')); click(row('c'));    // corregir (2 pasos)
  assert.strictEqual(w.eval('clId'), 1, 'corregir vuelve a elegir el cliente'); assert.strictEqual($('#pay').value, 'Cuenta corriente'); assert(!db().sales.some(s => s.id === id1), 'la venta original se quitó para recargarla');
  assert.strictEqual(db().prods.find(p => p.id === 1).lots.reduce((a, l) => a + l.qty, 0), stockAntes + 2, 'devolvió el stock'); assert(w.eval('cartTotal()') === 5040);
  click('#cobrar'); const nueva = db().sales.find(s => s.cid === 1 && s.total === 5040); assert(nueva, 'se cobró de nuevo');
  tab('r'); w.eval("$('#per').dispatchEvent(new Event('change'))"); click(row('v')); click(row('v'));
  assert(db().sales.find(s => s.id === nueva.id).void, 'anulada'); assert.strictEqual(w.eval('debtOf(1)'), -2000, 'la venta anulada deja de contar en la deuda (quedan 2000 de pago a favor)');

  // ---------- ELIMINAR CLIENTES ----------
  tab('c'); const delC = n => [...w.document.querySelectorAll('#cli tr')].find(tr => tr.textContent.includes(n)).querySelector('[data-d]');
  click(delC('Kiosco La Esquina')); assert(/movimientos/.test($('#toast').textContent)); assert(db().clients.some(c => c.id === 1), 'con movimientos no se elimina');
  click(delC('Negativo')); assert(db().clients.some(c => c.name === 'Negativo'), 'pide confirmación'); click(delC('Negativo')); assert(!db().clients.some(c => c.name === 'Negativo'));
  // editar
  click([...w.document.querySelectorAll('#cli tr')].find(tr => tr.textContent.includes('Almacén Don Luis')).querySelector('[data-e]')); assert.strictEqual($('#cn').value, 'Almacén Don Luis'); $('#cd').value = '12'; click('#cg'); assert.strictEqual(db().clients.find(c => c.id === 2).disc, 12);

  // ---------- REPORTES ----------
  tab('r'); $('#per').value = '9999'; w.eval("$('#per').dispatchEvent(new Event('change'))");
  const k = txt('#kpis'); assert(/Ganancia estimada/.test(k) && /Rentabilidad/.test(k) && /Deuda de clientes/.test(k) && /Bajas de stock/.test(k));
  const pdf = w.eval('buildReport()').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert(/Ganancia estimada/.test(pdf) && /Ventas por cliente/.test(pdf) && /Venta particular/.test(pdf) && /Kiosco 33/.test(pdf), 'el PDF incluye ventas por cliente');
  assert(/Rentabilidad/.test(pdf)); assert.deepStrictEqual(errs, []);
  console.log('COSTOS_CLIENTES_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
