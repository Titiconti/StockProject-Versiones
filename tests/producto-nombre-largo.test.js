// Regresion: un nombre de producto de mas de 200 caracteres quedaba en memoria, y como validar.js lo rechaza, despues no se guardaba NADA mas.
const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w);
  const n0 = ev('db.prods.length');
  a.tab('p'); a.set('#fn', 'N'.repeat(201)); a.set('#fp', '100'); a.set('#fm', '1'); a.set('#fs', '5'); a.click('#fg');
  assert.strictEqual(ev('db.prods.length'), n0, 'no agrega el producto con nombre demasiado largo');
  assert(/demasiado largo/.test($('#toast').textContent), 'avisa el motivo');
  a.set('#fn', 'N'.repeat(200)); a.click('#fg');
  assert.strictEqual(ev('db.prods.length'), n0 + 1, 'con 200 caracteres si guarda');
  assert.deepStrictEqual(a.errs, []);
  console.log('producto-nombre-largo OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
