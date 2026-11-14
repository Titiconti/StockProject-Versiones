// Vista de productos en Ventas y historial unificado de actividad (v3.0.0, fase 2).
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, db, errs } = web();
  const carta = id => $(`#prods .p[data-id="${id}"]`);
  // ---- vista: estados con texto, código y cambio cuadrícula/lista recordado ----
  tab('v'); assert(/Disponible/.test(carta(1).textContent) && /7790895/.test(carta(1).textContent), 'muestra estado y código');
  assert(/Stock bajo/.test(carta(4).textContent), 'galletitas: 3 con mínimo 5'); assert(/Sin stock/.test(carta(6).textContent) && carta(6).disabled);
  w.eval("db.prods.find(p=>p.id===3).lots.forEach(l=>l.exp='2020-01-01');draw()"); assert(/Vencido · no vendible/.test(carta(3).textContent) && carta(3).disabled, 'vencido con texto, no solo color');
  assert(/Vence/.test(carta(5).textContent), 'aviso de vencimiento próximo');
  assert(!$('#prods').classList.contains('lista')); click('#vvw [data-vw="l"]'); assert($('#prods').classList.contains('lista') && $('#vvw [data-vw="l"]').classList.contains('on'));
  assert.strictEqual(w.localStorage.getItem('sp_vista_ventas'), 'l', 'se recuerda en este equipo'); click('#vvw [data-vw="g"]'); assert(!$('#prods').classList.contains('lista'));

  // ---- acciones que deben quedar en el historial ----
  w.eval('CJ.abrir(500,"Mostrador")'); click('#prods .p[data-id="1"]'); click('#cobrar');                  // venta
  const sid = db().sales[0].id; assert.strictEqual(db().sales[0].user, 'Sin usuario', 'la venta guarda el responsable');
  tab('r'); click(`#hist [data-v="${sid}"]`); click(`#hist [data-v="${sid}"]`); assert(db().sales[0].voidAt && db().sales[0].voidBy, 'la anulación guarda quién y cuándo');
  tab('i'); click('#inv [data-l="2"]'); set('#ln', 'X9'); set('#lq', '5'); click('#lg');                          // ajuste de stock
  click('#inv [data-e="2"]'); set('#fp', '1500'); click('#fg');                                                      // cambio de precio
  assert(db().ajustes.some(a => a.tipo === 'producto.precio' && /1\.200,00.*1\.500,00/.test(a.txt.replace(/\s/g, ' '))), 'cambio de precio registrado');
  w.eval("CJ.cerrar(500)");

  // ---- pantalla Actividad ----
  w.eval("$('#masmenu button[data-t=\"z\"]').click()"); assert(!$('#z').classList.contains('hide'));
  const t = txt('#ac_l'); ['Venta', 'Venta anulada', 'Apertura de caja', 'Cierre de caja', 'Lote agregado', 'Cambio de precio o costo'].forEach(a => assert(t.includes(a), 'falta ' + a));
  const filas = [...w.document.querySelectorAll('#ac_l tr')].map(r => r.textContent); assert(/Cierre de caja/.test(filas[0]), 'lo más reciente primero');
  $('#ac_t').value = 'caja'; w.eval("$('#ac_t').dispatchEvent(new Event('change'))"); assert.strictEqual(w.document.querySelectorAll('#ac_l tr').length, 2, 'filtro por tipo');
  $('#ac_t').value = ''; set('#ac_q', 'agua'); assert(/Agua mineral/.test(txt('#ac_l')) && !/Apertura/.test(txt('#ac_l')), 'búsqueda');
  set('#ac_q', ''); $('#ac_d').value = w.eval('plus(1)'); w.eval("$('#ac_d').dispatchEvent(new Event('change'))"); assert(/No hay acciones/.test(txt('#ac_l')));
  assert.strictEqual(db().ajustes.length, 2, 'el historial no duplica las ventas ni las cajas: solo guarda los ajustes');

  assert.deepStrictEqual(errs, []);
  console.log('VENTAS_ACTIVIDAD_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
