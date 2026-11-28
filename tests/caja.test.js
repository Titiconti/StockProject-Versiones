// Caja (v3.0.0 fase 1): apertura obligatoria, efectivo esperado, cierre con diferencia, historial y salida con caja abierta.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, f, db, errs } = web();
  const toast = () => $('#toast').textContent;
  const vender = (id, n, pay, rec) => { for (let i = 0; i < n; i++) click(`#prods .p[data-id="${id}"]`); $('#pay').value = pay; w.eval("$('#pay').dispatchEvent(new Event('change'))"); if (rec) set('#rec', rec); click('#cobrar'); };

  // En la demo web la caja es opcional: se vende sin abrirla (compatibilidad con el uso anterior).
  tab('v'); assert(/Caja cerrada/.test(txt('#cjbar')));
  vender(1, 1, 'Efectivo'); assert.strictEqual(db().sales.length, 1, 'sin exigir caja, vende como antes'); assert.strictEqual(db().sales[0].caja, undefined);

  // Exigiendo caja: no se puede cobrar sin abrirla, y no se toca el stock.
  w.eval('db.cfg.cajaObligatoria=true;draw()');
  const stock1 = db().prods.find(p => p.id === 1).lots.reduce((a, l) => a + l.qty, 0);
  vender(1, 2, 'Efectivo'); assert(/Abrí la caja/.test(toast())); assert.strictEqual(db().sales.length, 1, 'no se registró la venta');
  assert.strictEqual(db().prods.find(p => p.id === 1).lots.reduce((a, l) => a + l.qty, 0), stock1, 'el stock no cambió');
  assert($('#cjov'), 'se abre el formulario de apertura'); assert(/tiene que haber una caja abierta/.test(txt('#cjov')));

  // Validaciones de apertura y apertura con dinero inicial.
  set('#cj_ini', '-5'); click('#cj_aok'); assert(/dinero inicial/.test(toast())); assert.strictEqual((db().cajas || []).length, 0);
  set('#cj_ini', '1000'); set('#cj_nom', 'Mostrador'); click('#cj_aok');
  let c = db().cajas[0]; assert(c && !c.cierre && c.ini === 1000 && c.caja === 'Mostrador' && c.user === 'Sin usuario'); assert(!$('#cjov'));
  assert(/Mostrador abierta/.test(txt('#cjbar'))); assert(w.eval('CJ.abrir(5).err'), 'no se abren dos cajas a la vez');

  // El carrito seguía armado: ahora se cobra en efectivo. Después tarjeta, transferencia y cuenta corriente.
  click('#cobrar'); assert.strictEqual(db().sales.length, 2); assert.strictEqual(db().sales[1].caja, c.id, 'la venta queda en la caja abierta');
  vender(2, 1, 'Tarjeta de débito'); vender(3, 1, 'Transferencia');
  w.eval('setClient(1)'); vender(5, 2, 'Cuenta corriente');
  const k = () => w.eval('JSON.stringify(CJ.calc(CJ.abierta()))'), K = () => JSON.parse(k());
  // precios: Coca 2800 (x2 = 5600 efectivo) · Agua 1200 tarjeta · Yerba 6900 transf · Leche 1650 x2 con 10% = 2970 cta cte
  let t = K(); assert.strictEqual(t.efVentas, 5600); assert.strictEqual(t.esperado, 6600, 'solo el efectivo suma a la caja');
  assert.strictEqual(t.vendido, 5600 + 1200 + 6900 + 2970); assert.strictEqual(t.porMedio['Cuenta corriente'], 2970, 'crédito: vendido pero no cobrado');

  // Cobro de deuda en efectivo suma; por transferencia no.
  tab('c'); w.eval('cSel=1;draw()'); set('#cm', '500'); $('#cmm').value = 'Efectivo'; click('#cpay'); set('#cm', '300'); $('#cmm').value = 'Transferencia'; click('#cpay');
  assert(db().pays.every(p => p.caja === c.id)); t = K(); assert.strictEqual(t.efCobros, 500); assert.strictEqual(t.esperado, 7100);

  // Movimientos de efectivo: retiro con motivo obligatorio y sin superar lo que hay.
  tab('v'); click('#cj_mv'); set('#cj_mm', '100'); set('#cj_mo', ''); click('#cj_mok'); assert(/motivo/.test(toast()));
  set('#cj_mm', '99999'); set('#cj_mo', 'Proveedor'); click('#cj_mok'); assert(/No hay tanto efectivo/.test(toast()));
  set('#cj_mm', '100'); click('#cj_mok'); t = K(); assert.strictEqual(t.egresos, 100); assert.strictEqual(t.esperado, 7000);
  assert.ok(w.eval("CJ.mov('ingreso',50,'Cambio').ok")); assert.strictEqual(K().esperado, 7050);

  // Anular una venta en efectivo la saca del esperado.
  tab('r'); const sid = db().sales[1].id; click(`#hist [data-v="${sid}"]`); click(`#hist [data-v="${sid}"]`);
  assert(db().sales.find(s => s.id === sid).void); assert.strictEqual(K().esperado, 1450, 'la venta anulada ya no suma');

  // Cierre: sin contado no cierra; con diferencia exige observación; con sobrante se guarda.
  tab('v'); click('#cj_ce'); assert(/Efectivo esperado/.test(txt('#cjov')) && txt('#cjov').includes(f(1450)));
  click('#cj_cok'); assert(/dinero contado/.test(toast()));
  set('#cj_ct', '1500'); assert(/Sobrante/.test(txt('#cj_df'))); set('#cj_cn', 'Propina'); click('#cj_cok'); c = db().cajas[0];   // v5.7.3: el cierre nunca se bloquea por una diferencia
  assert(c.cierre && c.contado === 1500 && c.dif === 50 && c.notaCierre === 'Propina' && c.tot.esperado === 1450); assert(/Cierre registrado/.test(toast()) && /Sobrante/.test(toast()), 'el dueño ve la diferencia en el aviso');
  assert(/Caja cerrada/.test(txt('#cjbar')));
  // Un cierre confirmado es una foto: una venta anulada después no lo modifica.
  w.eval('db.sales[2].void=true'); assert.strictEqual(db().cajas[0].tot.esperado, 1450);

  // Faltante y equilibrada.
  assert.ok(w.eval('CJ.abrir(200,"Mostrador").ok'));
  assert.ok(w.eval("CJ.cerrar(150,'Error de vuelto').ok"), 'un faltante cierra igual'); assert.strictEqual(db().cajas[1].dif, -50);
  assert.ok(w.eval('CJ.abrir(300).ok')); assert.ok(w.eval('CJ.cerrar(300).ok'), 'equilibrada no pide observación'); assert.strictEqual(db().cajas[2].dif, 0);
  assert.deepStrictEqual(db().cajas.map(x => w.eval(`CJ.dif(${x.dif})[1]`)), ['Sobrante', 'Faltante', 'Equilibrada']);

  // Historial con filtros.
  w.eval("$('#masmenu button[data-t=\"k\"]').click()"); assert(!$('#k').classList.contains('hide'));
  assert.strictEqual($('#kh_l').querySelectorAll('tr').length, 3); assert(/Propina/.test(txt('#kh_l')) && /Retiro/.test(txt('#kh_l')));
  $('#kh_e').value = 'd'; w.eval("$('#kh_e').dispatchEvent(new Event('change'))"); assert.strictEqual($('#kh_l').querySelectorAll('tr').length, 2, 'solo las que tienen diferencia');
  $('#kh_e').value = 'a'; w.eval("$('#kh_e').dispatchEvent(new Event('change'))"); assert(/no hay cajas/.test(txt('#kh_l')));

  // Salir con la caja abierta: se pide el cierre en vez de salir.
  assert.ok(w.eval('CJ.abrir(0).ok')); w.eval("$('#ses').innerHTML='<button id=\"salir\">Salir</button>';window._salio=0;$('#salir').onclick=()=>{window._salio=1}");
  click('#salir'); assert.strictEqual(w.eval('window._salio'), 0, 'no salió'); assert(/Cerrala antes de salir/.test(txt('#cjov')));
  set('#cj_ct', '0'); click('#cj_cok'); click('#salir'); assert.strictEqual(w.eval('window._salio'), 1, 'con la caja cerrada sale');

  // Configuración: el interruptor refleja y cambia la regla.
  tab('g'); w.eval('draw()'); assert($('#cj_req').checked); $('#cj_req').checked = false; w.eval("$('#cj_req').dispatchEvent(new Event('change'))"); assert.strictEqual(db().cfg.cajaObligatoria, false);

  assert.deepStrictEqual(errs, []);
  console.log('CAJA_OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
