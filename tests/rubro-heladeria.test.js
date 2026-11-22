// v5.7: Heladería aparece en la pregunta "¿Cuál es tu rubro?" del primer uso y al elegirla activa el rubro.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, txt, db, errs } = web(), ev = w.eval.bind(w);
  const radio = (n, v) => { const i = $(`#enc [name="${n}"][value="${v}"]`); i.checked = true; i.dispatchEvent(new w.Event('change', { bubbles: true })); };
  ev('CF.abrirEncuesta(true)'); assert(/¿Cuál es tu rubro\?/.test(txt('#enc')) && /Heladería/.test(txt('#enc')), 'Heladería está en la lista');
  assert($('#enc [name="tipo"][value="heladeria"]'), 'con su opción'); radio('tipo', 'heladeria'); click('#e_sig');
  for (let i = 0; i < 3 && /contanos|volumen|necesit|Paso/i.test(txt('#enc')) && !$('#e_nom'); i++) click('#e_sig');
  while ($('#enc') && !$('#e_nom')) click('#e_sig'); $('#e_nom').value = 'Helados Ana'; click('#e_sig');
  assert(!$('#enc'), 'la encuesta termina'); assert.strictEqual(db().cfg.rubro, 'heladeria'); assert.strictEqual(db().cfg.caps.heladeria, true);
  assert.deepStrictEqual(errs, []); console.log('RUBRO_HELADERIA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });