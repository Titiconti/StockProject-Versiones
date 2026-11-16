// Resumen financiero (automática, sin cargar nada), retiros de caja con tipo de gasto, pago a proveedores y Reportes › Tendencias.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, tab, txt, f, db, errs } = web();
  const ev = w.eval.bind(w), toast = () => $('#toast').textContent;
  const vender = (ids, pay, cli) => { if (cli) ev(`setClient(${cli})`); ids.forEach(i => ev(`add(${i})`)); $('#pay').value = pay; ev("$('#pay').dispatchEvent(new Event('change'))"); click('#cobrar'); };
  ev('CJ.abrir(10000)');
  vender([1, 1], 'Efectivo'); vender([3], 'Tarjeta de débito'); vender([2], 'Transferencia'); vender([5], 'Cuenta corriente', 1);   // 5600 · 6900 · 1200 · 1485 (10 % de descuento)
  tab('c'); ev('cSel=1;draw()'); $('#cm').value = '485'; $('#cmm').value = 'Efectivo'; click('#cpay');
  // retiro de caja con tipo de gasto
  tab('v'); click('#cj_mv'); $('#cj_mt').value = 'egreso'; $('#cj_mm').value = '1000'; $('#cj_mo').value = 'Bolsas'; $('#cj_mc').value = 'Mercadería e insumos'; click('#cj_mok');
  assert.strictEqual(db().cajas[0].movs[0].cat, 'Mercadería e insumos');
  ev("db.fin.pagar.push({id:db.fin.id++,prov:'Lácteos del Valle',desc:'Mercadería',monto:3000,vence:'',pagado:false});save()");
  // pantalla
  ev("$('#masmenu button[data-t=\"w\"]').click()"); assert(!$('#w').classList.contains('hide')); const t = () => txt('#w');
  assert(t().includes(f(5600 + 6900 + 1200 + 485)), 'entró: ventas cobradas y el cobro de la deuda, sin la venta a cuenta');
  assert(/Efectivo/.test(txt('#pn_m')) && txt('#pn_m').includes(f(5600 + 485)) && txt('#pn_m').includes(f(6900)) && txt('#pn_m').includes(f(1200)));
  const costo = 2 * 1900 + 4800 + 700 + 1200, gan = 5600 + 6900 + 1200 + 1485 - costo - 1000; assert(txt('#pn_g').includes(f(gan)), 'ganancia = vendido − costo − gastos de caja');
  assert(txt('#pn_td').includes(f(1000)), 'te deben 1485 − 485'); assert(txt('#pn_dp').includes(f(3000))); assert(/Bolsas/.test(txt('#pn_gl')) && /Mercadería e insumos/.test(txt('#pn_gl')));
  const caja0 = ev('CJ.calc(CJ.abierta()).esperado'); assert(txt('#pn_ca').includes(f(caja0)));
  // pagar al proveedor con la caja
  click('#pn_dl [data-pg]'); assert($('#plv')); click('#plv [data-pm="caja"]'); assert(!$('#plv'));
  const g = db().fin.pagar[0]; assert(g.pagado && g.cta === 'Caja'); const m = db().cajas[0].movs[1]; assert(m.monto === 3000 && m.cat === 'Proveedor' && /Lácteos del Valle/.test(m.motivo));
  assert(/No le debés nada/.test(txt('#pn_dl'))); assert.strictEqual(ev('CJ.calc(CJ.abierta()).esperado'), caja0 - 3000);
  // períodos
  click('#pn_p [data-pp="h"]'); assert(/Entró hoy/.test(txt('#pn_et'))); click('#pn_p [data-pp="m"]'); assert(/Entró este mes/.test(txt('#pn_et')));
  // Finanzas completa es avanzada; Resumen financiero, no
  assert(/body\.simple nav button\[data-t="f"\]/.test($('#sicss').textContent)); assert(!/data-t="w"/.test($('#sicss').textContent));
  // ---- Reportes › Tendencias ----
  tab('r'); assert($('#r #a'), 'la analítica vive dentro de Reportes'); assert($('#a').classList.contains('hide'));
  click('#r_t [data-rt="t"]'); assert(!$('#a').classList.contains('hide') && $('#r').classList.contains('tend')); assert(txt('#a').length > 50, 'muestra la analítica');
  tab('v'); tab('r'); assert(!$('#a').classList.contains('hide'), 'recuerda la pestaña');
  click('#r_t [data-rt="r"]'); assert($('#a').classList.contains('hide') && !$('#r').classList.contains('tend'));
  assert.deepStrictEqual(errs, []); console.log('PLATA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
