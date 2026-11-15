// Interfaz simple: las funciones ocasionales quedan ocultas hasta activar "Funciones avanzadas"; no se pierde nada.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, tab, db, errs } = web();
  const ev = w.eval.bind(w), css = $('#sicss').textContent;
  assert(w.document.body.classList.contains('simple'), 'arranca en modo simple');
  ['nav button[data-t="a"]', '#fnp [data-s="b"]', '#fnp [data-s="s"]', '#cs_det', '#gp2 [data-s="m"]'].forEach(s => { assert(css.includes('body.simple ' + s), 'se oculta ' + s); assert($(s), 'sigue existiendo ' + s); });
  // las pantallas esenciales no se ocultan
  ['v', 'p', 'i', 'c', 'r', 'k', 'o', 'e'].forEach(t => assert(!css.includes(`nav button[data-t="${t}"]`), 'esencial o útil: ' + t));
  // activar desde Configuración
  tab('g'); ev('draw()'); const c = $('#si_on'); assert(!c.checked); c.checked = true; c.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.strictEqual(db().cfg.avanzado, true); assert(!w.document.body.classList.contains('simple'), 'todo vuelve a verse');
  // al desactivar estando en una pantalla avanzada, vuelve a Ventas
  ev("$('nav button[data-t=\"a\"]').click()"); assert(!$('#a').classList.contains('hide')); ev('db.cfg.avanzado=false;draw()');
  assert($('#a').classList.contains('hide') && !$('#v').classList.contains('hide')); assert(w.document.body.classList.contains('simple'));
  assert.deepStrictEqual(errs, []); console.log('SIMPLE_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
