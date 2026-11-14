// v3.1: entrevista por rubro → capacidades reales (preguntas condicionales, validación, resumen, persistencia y reanudación).
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, db, errs } = web();
  const ev = w.eval.bind(w), J = e => JSON.parse(ev(`JSON.stringify(${e})`)), toast = () => $('#toast').textContent;
  const radio = (n, v) => { const i = w.document.querySelector(`#rbc [name="${n}"][value="${v}"]`); i.checked = true; i.dispatchEvent(new w.Event('change', { bubbles: true })); };
  // cada rubro muestra sus preguntas y da sus capacidades
  const caps = (rubro, r = {}, extra = []) => J(`RB.resolver(${JSON.stringify({ rubro, r, extra })}).caps`);
  assert.deepStrictEqual(J(`RB.visibles({rubro:'ropa',r:{}})`), ['r_var', 'r_atr', 'r_desc', 'stock']);
  assert.deepStrictEqual(J(`RB.visibles({rubro:'ropa',r:{r_var:false}})`), ['r_var', 'r_desc', 'stock'], 'condicional');
  assert(caps('ropa').variantes && !caps('ropa').peso && !caps('ropa').vencimientos); assert(caps('almacen').peso && caps('almacen').vencimientos);
  assert(caps('electronica').series && caps('electronica').garantias); assert(caps('mayorista').tramos && caps('mayorista').minimos);
  assert(!caps('kiosco').peso && caps('kiosco', { k_peso: true }).peso); assert(caps('ropa', {}, ['peso']).peso, 'capacidad adicional');
  assert(/Elegí un rubro/.test(ev(`RB.validar({rubro:'x',r:{}})`))); assert(/Falta responder|al menos una/.test(ev(`RB.validar({rubro:'ropa',r:{r_atr:''}})`)));
  // sin entrevista: todas las opciones de producto disponibles (comportamiento anterior)
  tab('p'); assert(!w.document.querySelector('#pxo [data-cap="peso"]').classList.contains('hide'));
  // recorrido completo: ropa
  tab('g'); ev('draw()'); click('#rb_ab'); click('#rb_si'); assert(/Elegí un rubro/.test(toast()));
  radio('rb_r', 'ropa'); click('#rb_si'); assert(/talle y color/.test(txt('#rbc')) && $('#rbc [data-rq="r_atr"]'));
  radio('rb_r_var', '0'); assert(!$('#rbc [data-rq="r_atr"]'), 'desaparece'); radio('rb_r_var', '1'); assert($('#rbc [data-rq="r_atr"]'));
  $('#rbc [data-rq="r_atr"]').value = ''; click('#rb_si'); assert(/Falta responder|al menos una/.test(toast()));
  $('#rbc [data-rq="r_atr"]').value = 'Talle, Color, Tela'; click('#rb_si');
  // cerrar y retomar
  click('#rb_ce'); assert(!$('#rbo') && db().cfg.entrevistaBorrador.paso === 2 && !db().cfg.caps); ev('draw()'); assert(/Retomar/.test(txt('#rb_ab')));
  click('#rb_ab'); assert(/sumar algo más/.test(txt('#rbc')), 'retoma en el mismo paso'); w.document.querySelector('#rbc [data-rx="tramos"]').checked = true; click('#rb_si');
  const t = txt('#rbc'); assert(/Resumen/.test(t) && /Ropa/.test(t) && /Variantes/.test(t) && /Talle · Color · Tela/.test(t) && /Precios por cantidad/.test(t));
  click('#rb_at'); assert(/sumar algo más/.test(txt('#rbc'))); click('#rb_si');
  const prods0 = JSON.stringify(db().prods); click('#rb_si');
  const c = db().cfg; assert(c.rubro === 'ropa' && c.caps.variantes && c.caps.tramos && !c.caps.peso && !c.entrevistaBorrador); assert.deepStrictEqual(c.atributos, ['Talle', 'Color', 'Tela']);
  assert.strictEqual(JSON.stringify(db().prods), prods0, 'no toca los productos existentes');
  // efecto real: el formulario de producto ofrece solo lo habilitado
  tab('p'); const oc = k => w.document.querySelector(`#pxo [data-cap="${k}"]`).classList.contains('hide');
  assert(oc('peso') && oc('garantias') && !oc('tramos') && !oc('control')); assert(w.document.querySelector('#px_ctl option[value="serie"]').disabled && !w.document.querySelector('#px_ctl option[value="variantes"]').disabled);
  assert.deepStrictEqual(J('PX.atrs()'), ['Talle', 'Color', 'Tela']);
  // alertas desactivadas en la entrevista
  ev("RB.aplicar({rubro:'kiosco',r:{stock:false},extra:[]});draw()"); assert(!J('AV.lista()').some(x => x.t === 'stock')); assert(db().cfg.caps.alertaStock === false);
  assert.deepStrictEqual(errs, []); console.log('RUBROS_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
