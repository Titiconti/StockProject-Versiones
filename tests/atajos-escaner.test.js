// Atajos de Ventas y validaciones del escáner (v3.0.0, fase 1).
const assert = require('assert'), { web, wait } = require('./helpers');
(async () => {
  const { w, d, $, click, set, tab, txt, db, errs } = web();
  const key = (k, el = d.body) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const toast = () => $('#toast').textContent;
  // El lector escribe el código muy rápido y termina con Enter.
  const scan = async (code, el = $('#q')) => { el.focus(); for (const c of code) { key(c, el); el.value += c; } key('Enter', el); await wait(5); };

  tab('v'); assert(/F8 cobrar/.test(txt('#athelp')), 'los atajos se muestran en Ventas');
  // F2 enfoca la búsqueda desde otra pantalla
  tab('i'); key('F2'); assert(!$('#v').classList.contains('hide'), 'F2 vuelve a Ventas'); assert.strictEqual(d.activeElement, $('#q'));
  // F4..F7 cambian el medio de pago; F7 sin cliente no se permite
  key('F6'); assert.strictEqual($('#pay').value, 'Transferencia'); key('F5'); assert.strictEqual($('#pay').value, 'Tarjeta de débito');
  key('F7'); assert.strictEqual($('#pay').value, 'Tarjeta de débito', 'sin cliente no hay cuenta corriente'); assert(/elegí primero un cliente/.test(toast()));
  w.eval('setClient(1)'); key('F7'); assert.strictEqual($('#pay').value, 'Cuenta corriente'); w.eval('setClient(null)'); key('F4'); assert.strictEqual($('#pay').value, 'Efectivo');

  // F8 sin productos no hace nada; con productos pide confirmación (no vende solo)
  key('F8'); assert(!$('#atov') && /No hay productos/.test(toast()));
  await scan('7790895'); assert.strictEqual(w.eval('cart[1]'), 1, 'escaneo agrega Coca-Cola');
  await scan('7790895'); assert.strictEqual(w.eval('cart[1]'), 1, 'la misma lectura repetida enseguida no suma dos veces');
  await wait(450); await scan('7790895'); assert.strictEqual(w.eval('cart[1]'), 2, 'un segundo escaneo real sí suma');
  key('F8'); assert($('#atov'), 'F8 abre la confirmación'); assert.strictEqual(db().sales.length, 0, 'todavía no se vendió');
  key('Escape'); assert(!$('#atov') && db().sales.length === 0, 'Esc cancela');
  key('F8'); key('Enter', $('#at_ok')); assert(!$('#atov')); assert.strictEqual(db().sales.length, 1, 'Enter confirma'); assert.strictEqual(db().sales[0].items[0].qty, 2);
  // con la ventana de caja abierta, los atajos no actúan
  w.eval('CJ.formAbrir()'); key('F6'); assert.strictEqual($('#pay').value, 'Efectivo'); w.eval('CJ.close()');

  // Código inexistente
  await scan('0000001'); assert(/no encontrado/.test(toast()));
  // Producto con todos los lotes vencidos: se explica y no se agrega
  w.eval("db.prods.find(p=>p.id===4).lots.forEach(l=>l.exp='2020-01-01');draw()");
  await scan('7792001'); assert(/lotes están vencidos/.test(toast())); assert.strictEqual(w.eval('cart[4]'), undefined);
  // Escribir el código y Enter: se usa ese producto, nunca otro que lo contenga en el nombre
  set('#q', '7792001'); key('Enter', $('#q')); assert(/vencidos/.test(toast())); assert.strictEqual(Object.keys(w.eval('cart')).length, 0);
  // Esc en el buscador lo limpia
  set('#q', 'yerba'); key('Escape', $('#q')); assert.strictEqual($('#q').value, '');

  // Producto con un lote vencido y otro vigente: se vende del vigente (no se bloquea todo el producto)
  w.eval("db.prods.find(p=>p.id===5).lots=[{id:900,n:'V',qty:3,exp:'2020-01-01'},{id:901,n:'OK',qty:2,exp:plus(60)}];draw()");
  await scan('7793010'); assert.strictEqual(w.eval('cart[5]'), 1);
  // Si mientras está en el carrito el stock vendible baja (p. ej. vence el lote), no se registra una venta incompleta
  w.eval('cart[5]=2;db.prods.find(p=>p.id===5).lots[1].exp="2020-01-02"'); click('#cobrar');
  assert(/Cambió el stock vendible/.test(toast())); assert.strictEqual(db().sales.length, 1, 'no se vendió'); assert.strictEqual(w.eval('cart[5]'), undefined, 'se sacó del carrito');
  assert.strictEqual(db().prods.find(p => p.id === 5).lots.reduce((a, l) => a + l.qty, 0), 5, 'no se tocó el stock');

  assert.deepStrictEqual(errs, []);
  console.log('ATAJOS_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
