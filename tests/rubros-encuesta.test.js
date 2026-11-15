// La encuesta inicial elige el rubro y cambia de verdad el programa: opciones del producto, unidad por defecto, categorías y motivos de baja.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, tab, txt, db, errs } = web();
  const ev = w.eval.bind(w), oculto = k => [...w.document.querySelectorAll(`#pxo [data-cap="${k}"]`)].every(x => x.classList.contains('hide'));
  const radio = (n, v) => { const i = $(`#enc [name="${n}"][value="${v}"]`); i.checked = true; i.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const quitar = id => { const x = $(id); if (x) x.parentNode.removeChild(x); };
  const encuesta = (rubro, resp = {}) => { ev('CF.abrirEncuesta(true)'); radio('tipo', rubro); click('#e_sig');
    if (/contanos cómo trabajás/.test(txt('#enc'))) { for (const [k, v] of Object.entries(resp)) radio('rb_' + k, v ? '1' : '0'); click('#e_sig'); }
    click('#e_sig'); click('#e_sig'); click('#e_sig'); assert(!$('#enc'), 'la encuesta termina'); quitar('#tour'); };
  // los rubros pedidos existen
  ['kiosco', 'almacen', 'verduleria', 'carniceria', 'cafeteria'].forEach(r => assert(ev(`!!RB.PERFILES.${r}`), r));
  // sin encuesta: lo básico, sin marca/modelo ni series
  tab('p'); ev('draw()'); assert(oculto('garantias') && oculto('tramos') && !oculto('peso'), 'sin encuesta no aparecen marca ni modelo');
  // quien contestó la encuesta vieja como restaurante/cafetería tampoco ve marca y modelo
  ev("db.cfg.encuesta={tipo:'restaurante',necs:[],pais:'AR'};draw()"); assert(oculto('garantias') && oculto('control'), 'encuesta anterior: cafetería sin marca ni modelo'); ev('delete db.cfg.encuesta');
  // cafetería: preguntas propias, sin marca/modelo/series/variantes
  encuesta('cafeteria', { f_insumos: true, f_peso: false });
  let c = db().cfg; assert.strictEqual(c.rubro, 'cafeteria'); assert.strictEqual(c.encuesta.tipo, 'restaurante'); assert(c.caps.vencimientos && !c.caps.peso && !c.caps.garantias && !c.caps.series);
  tab('p'); ev('draw()'); assert(oculto('garantias') && oculto('peso') && oculto('control') && oculto('tramos') && !oculto('vencimientos'));
  assert(/Café con leche/.test($('#fn').placeholder)); assert([...$('#px_cats').options].some(o => o.value === 'Pastelería'), 'categorías del rubro');
  assert(c.motivosBaja.includes('Preparación fallida'));
  // verdulería: por kilo de entrada, con merma; sin vencimiento obligatorio
  encuesta('verduleria', { v_unidad: true, v_merma: true, v_huevos: false });
  c = db().cfg; assert.strictEqual(c.caps.unidadPorDefecto, 'kg'); assert(c.caps.peso && !c.caps.vencimientos && !c.caps.garantias);
  assert(c.motivosBaja.includes('Merma / maduración') && !c.motivosBaja.includes('Preparación fallida'), 'los motivos del rubro anterior se retiran');
  tab('p'); click('#fx'); assert.strictEqual($('#px_u').value, 'kg', 'producto nuevo arranca por peso'); assert(oculto('garantias') && oculto('vencimientos'));
  assert(/Precio por kg/.test(txt('#p'))); tab('e'); ev('draw()'); assert([...$('#emo').options].some(o => o.value === 'Merma / maduración'));
  // carnicería y electrónica
  encuesta('carniceria', { c_vto: true, c_elab: true, c_merma: false }); c = db().cfg; assert(c.caps.peso && c.caps.vencimientos && c.caps.unidadPorDefecto === 'kg' && !c.motivosBaja.includes('Merma por desposte'));
  encuesta('electronica'); tab('p'); ev('draw()'); assert(!oculto('garantias') && !oculto('control') && oculto('peso'), 'electrónica sí usa marca, modelo y series');
  // rubros agregados el 15/11: cada uno con sus preguntas y sus capacidades
  ['panaderia', 'ferreteria', 'farmacia', 'libreria', 'petshop', 'dietetica', 'perfumeria'].forEach(r => { assert(ev(`!!RB.PERFILES.${r}`), r); assert.strictEqual(ev(`RB.validar({rubro:'${r}',r:{},extra:[]})`), '', r + ' válido con sus valores por defecto'); assert(ev(`RB.PERFILES.${r}.pregs.every(q=>!!RB.PREGS[q])`), r + ': preguntas definidas'); });
  encuesta('farmacia'); c = db().cfg; assert(c.caps.vencimientos && c.caps.vtoPorDefecto && !c.caps.peso && !c.caps.garantias); tab('p'); click('#fx'); assert($('#px_vr').checked, 'farmacia: el producto nuevo exige vencimiento');
  assert(c.motivosBaja.includes('Devolución a droguería'));
  encuesta('ferreteria', { fe_peso: true, fe_tramos: true, fe_gar: true, fe_serie: false }); tab('p'); ev('draw()'); assert(!oculto('garantias') && !oculto('tramos') && !oculto('peso') && oculto('vencimientos'), 'ferretería: marca y modelo sí, vencimiento no');
  encuesta('perfumeria', { pf_vto: true, pf_var: true }); c = db().cfg; assert(c.caps.variantes); assert.deepStrictEqual(c.atributos, ['Tono']);
  encuesta('dietetica'); tab('p'); click('#fx'); assert.strictEqual($('#px_u').value, 'kg'); assert(db().cfg.motivosBaja.includes('Merma por fraccionado'));
  encuesta('panaderia', { pa_peso: true, pa_vto: false, pa_merma: true }); assert(db().cfg.motivosBaja.includes('Sobrante del día') && !db().cfg.motivosBaja.includes('Merma por fraccionado'));
  // servicios: sin preguntas de rubro (4 pasos)
  ev('CF.abrirEncuesta(true)'); radio('tipo', 'servicios'); click('#e_sig'); assert(/Paso 2 de 4/.test(txt('#enc'))); quitar('#enc');
  assert.deepStrictEqual(errs, []); console.log('RUBROS_ENCUESTA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
