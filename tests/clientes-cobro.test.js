// Clientes simplificado (v3.0.0, fase 2): cobro parcial y total con resumen, comprobante y navegación entre cuentas.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, f, db, errs } = web();
  const toast = () => $('#toast').textContent, abrir = id => click(`#cli [data-m="${id}"]`);
  // deuda inicial: Ana (cliente 1) compra a cuenta corriente 2 leches con 10 % = 2970
  w.eval('setClient(1);add(5);add(5)'); $('#pay').value = 'Cuenta corriente'; click('#cobrar'); assert.strictEqual(w.eval('debtOf(1)'), 2970);
  tab('c'); abrir(1); assert(!$('#cdet').classList.contains('hide')); assert.strictEqual($('#cm').value, '2970.00', 'propone cobrar la deuda');

  // cobro parcial en efectivo: resumen con saldo anterior y pendiente
  set('#cm', '1000'); $('#cmm').value = 'Efectivo'; click('#cpay');
  assert.strictEqual(w.eval('debtOf(1)'), 1970); const p1 = db().pays[0]; assert(p1.amount === 1000 && p1.method === 'Efectivo' && p1.cid === 1, 'queda asociado al cliente y al medio');
  assert(txt('#cres').includes(f(2970)) && txt('#cres').includes('Saldo pendiente ' + f(1970)), 'resumen del cobro');
  // comprobante (demo web: usa la impresión del navegador)
  let impreso = ''; w.print = () => { impreso = w.document.querySelector('#tk').textContent.replace(/[\s ]+/g, ' '); }; click('#cprt'); await new Promise(r => setTimeout(r, 120));
  assert(/Comprobante de cobro/.test(impreso) && impreso.includes(f(1000)) && /Kiosco La Esquina/.test(impreso));

  // cobro total con "Cobrar todo": la cuenta queda saldada
  $('#cmm').value = 'Transferencia'; click('#cpall'); assert.strictEqual(w.eval('debtOf(1)'), 0); assert(/Cuenta saldada/.test(txt('#cres')));
  click('#cpall'); assert(/no tiene deuda/.test(toast())); assert.strictEqual(db().pays.length, 2, 'no se duplica el cobro');

  // cambiar de cliente: una sola ficha, sin arrastrar el resumen del anterior
  abrir(2); assert(/Almacén Don Luis/.test(txt('#cdt'))); assert.strictEqual(txt('#cres').trim(), '', 'el resumen era de otro cliente');
  assert.strictEqual(w.document.querySelectorAll('#cdet').length, 1);
  click('#cdmin'); assert($('#cdet').classList.contains('min') && /Expandir/.test(txt('#cdmin'))); click('#cdmin'); assert(!$('#cdet').classList.contains('min'));
  click('#cdo'); assert($('#cdet').classList.contains('min') && w.document.activeElement === $('#cbus'), 'vuelve a la lista para elegir otro');
  abrir(1); assert(!$('#cdet').classList.contains('min'), 'al abrir otra cuenta se expande');
  click('#cdc'); assert($('#cdet').classList.contains('hide') && w.eval('cSel') === null, 'cerrar vuelve a la vista inicial');

  // un límite de crédito cargado antes se sigue respetando y se puede quitar
  w.eval('cl$(2).limite=100;cSel=2;draw()'); assert(/Límite de crédito/.test(txt('#c_x'))); assert.strictEqual($('#cx_lim'), null);
  w.eval("$('#c_x details[data-k=\"lim\"]').open=true"); click('#cx_gl'); assert.strictEqual(db().clients.find(c => c.id === 2).limite, 0); assert(/Límite quitado/.test(toast()));

  assert.deepStrictEqual(errs, []);
  console.log('CLIENTES_COBRO_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
