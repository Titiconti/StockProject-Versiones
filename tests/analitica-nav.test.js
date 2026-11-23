// Regresion: activar la pestaña oculta "a" (Analitica) dejaba una pantalla vacia de alto 0 porque Analitica vive dentro de Reportes.
const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w);
  a.tab('a');
  assert(!$('#r').classList.contains('hide'), 'Reportes tiene que quedar visible');
  assert(!$('#a').classList.contains('hide'), 'Analitica tiene que quedar visible dentro de Reportes');
  assert(ev("PL.rtab") === 't' && $('#r').classList.contains('tend'), 'abre la pestaña Tendencias');
  assert($('#a').textContent.includes('Tendencia'), 'Analitica dibujada');
  // Factura sin letra guardada: se deduce del tipo, nunca "Factura undefined"
  assert.strictEqual(ev("FA.nombre({tipo:11,ptoVta:1,nro:5})"), 'Factura C 0001-00000005');
  assert(!/undefined/.test(ev("FA.nombre({ptoVta:1,nro:5})")));
  assert.deepStrictEqual(a.errs, []);
  console.log('analitica-nav OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
