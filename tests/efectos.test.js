// Efectos visuales: solo decoran. Las chispas salen únicamente cuando el producto se sumó de verdad a la venta,
// y los efectos de lienzo no se arman donde no se puede dibujar.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, tab, db, errs } = web();
  const ev = w.eval.bind(w);
  assert.strictEqual(ev('FX.lienzo'), false, 'sin lienzo disponible no se dibuja nada'); assert(!$('#fxdots'));
  ev("document.documentElement.classList.add('anim');window.__ch=0;FX.chispas=()=>{window.__ch++}");
  tab('v'); const n = () => ev('window.__ch');
  click('#prods .p[data-id="4"]'); assert.strictEqual(ev('cart[4]'), 1); assert.strictEqual(n(), 1, 'se sumó: hay chispas');
  click('#prods .p[data-id="4"]'); click('#prods .p[data-id="4"]'); assert.strictEqual(ev('cart[4]'), 3); assert.strictEqual(n(), 3);
  click('#prods .p[data-id="4"]'); assert.strictEqual(ev('cart[4]'), 3, 'no hay más stock'); assert.strictEqual(n(), 3, 'no se sumó: sin chispas');
  click('#prods .p[data-id="6"]'); assert.strictEqual(n(), 3, 'producto sin stock: sin chispas');
  ev("document.documentElement.classList.remove('anim')"); click('#prods .p[data-id="1"]'); assert.strictEqual(ev('cart[1]'), 1); assert.strictEqual(n(), 3, 'con las animaciones apagadas no hay efectos');
  assert.strictEqual(db().sales.length, 0, 'los efectos no tocan datos');
  assert.deepStrictEqual(errs, []); console.log('EFECTOS_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
