// Montos de caja escritos a mano: campos de texto (sin flechitas), formatos con coma y punto, rechazo de texto inválido,
// y el cierre que sale al cerrar el programa (CJ.app=true) deja escribir en el campo.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, txt, db, errs } = web();
  const ev = w.eval.bind(w);
  const toast = () => $('#toast').textContent;

  // Lector único.
  const casos = { '1500': 1500, '1500,50': 1500.5, '1.500,50': 1500.5, '1.500': 1500, '1500.50': 1500.5, '$ 2.000': 2000, '0': 0, ' 12,5 ': 12.5, '-5': -5 };
  for (const [t, n] of Object.entries(casos)) assert.strictEqual(ev(`CJ.num(${JSON.stringify(t)})`), n, 'CJ.num ' + t);
  for (const t of ['', 'abc', '12abc', '1,2,3', '1.2.3,4x']) assert(Number.isNaN(ev(`CJ.num(${JSON.stringify(t)})`)), 'rechaza ' + t);

  // Apertura: campo de texto con ayuda, sin spinner.
  ev("CJ.formAbrir()");
  for (const id of ['cj_ini']) {
    assert.strictEqual($('#' + id).type, 'text'); assert.strictEqual($('#' + id).getAttribute('inputmode'), 'decimal');
    assert(/coma: 1500,50/.test(txt('#' + id + '_h')), 'texto de ayuda de centavos');
  }
  set('#cj_ini', 'mucho'); click('#cj_aok'); assert(/no es un número válido/.test(toast())); assert.strictEqual((db().cajas || []).length, 0);
  set('#cj_ini', '1.000,50'); click('#cj_aok'); assert.strictEqual(db().cajas[0].ini, 1000.5);

  // Ingreso / retiro.
  ev("CJ.formMov()"); assert.strictEqual($('#cj_mm').type, 'text'); assert(/coma/.test(txt('#cj_mm_h')));
  set('#cj_mm', 'x'); set('#cj_mo', 'Cambio'); set('#cj_mt', 'ingreso'); click('#cj_mok'); assert(/no es un número válido/.test(toast()));
  set('#cj_mm', '200,25'); click('#cj_mok'); assert.strictEqual(db().cajas[0].movs[0].monto, 200.25);

  // Cierre que sale al cerrar el programa: se puede escribir y el campo conserva el foco.
  ev("CJ.app=()=>true");
  const e = new w.Event('beforeunload', { cancelable: true }); w.dispatchEvent(e); assert.strictEqual(e.defaultPrevented, true);
  await new Promise(r => setTimeout(r, 50));
  const c = $('#cj_ct'); assert(c, 'aparece el campo del cierre'); assert.strictEqual(c.type, 'text'); assert(/coma: 1500,50/.test(txt('#cj_ct_h')));
  assert.strictEqual(w.document.activeElement, c, 'el campo tiene el foco');
  assert(!c.readOnly && !c.disabled, 'no es de solo lectura');
  for (const ch of '1.200,75') { c.value += ch; c.dispatchEvent(new w.Event('input', { bubbles: true })); }
  assert.strictEqual(c.value, '1.200,75', 'se puede escribir');
  assert(/Diferencia/.test(txt('#cj_df')) && !/número válido/.test(txt('#cj_df')));
  set('#cj_ct', 'doce'); assert(/no es un número válido/.test(txt('#cj_df'))); click('#cj_cok'); assert(/no es un número válido/.test(toast())); assert(!db().cajas[0].cierre);
  set('#cj_ct', '1.200,75'); set('#cj_cn', 'ajuste'); click('#cj_cok');
  assert(db().cajas[0].cierre); assert.strictEqual(db().cajas[0].contado, 1200.75);
  ev("CJ.app=()=>false");
  assert.deepStrictEqual(errs, []); console.log('CAJA_MONTOS_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
