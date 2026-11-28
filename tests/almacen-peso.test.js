// Revisión de Almacén y venta por peso: $12.000/kg x 350 g = $4.200 exacto, stock en gramos enteros, reportes que no mezclan kilos con unidades,
// corregir/anular que devuelven el peso exacto, bajas de stock por peso a su costo real y el ticket con "0,350 kg x $/kg".
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, db, errs } = web();
  const ev = w.eval.bind(w), P = n => db().prods.find(p => p.name === n), g = n => P(n).lots.reduce((a, l) => a + l.qty, 0);
  const nuevo = (nombre, precio, stock, costo) => { tab('p'); click('#fx'); set('#fn', nombre); set('#fp', String(precio)); if (costo) set('#fk', String(costo)); $('#px_u').value = 'kg'; $('#px_u').dispatchEvent(new w.Event('change', { bubbles: true })); set('#fs', stock); click('#fg'); };
  const pesar = (n, gramos) => { tab('v'); click(`#prods .p[data-id="${P(n).id}"]`); $('#pxpu').value = 'g'; $('#pxpu').dispatchEvent(new w.Event('change', { bubbles: true })); set('#pxp', String(gramos)); click('#pxok'); };
  const cant = s => s.replace(/[\s ]+/g, ' ');

  // ---- ejemplo obligatorio: $12.000/kg x 350 g = $4.200 exacto ----
  nuevo('Queso', 12000, '5', 8000); pesar('Queso', 350);
  const id = P('Queso').id;
  assert.strictEqual(ev(`cart[${id}]`), 350); assert.strictEqual(ev('cartTotal()'), 4200);
  // cambiar el peso en el carrito (✎) y volver a 350: sigue exacto, sin tocar el stock hasta cobrar
  click(`#cart [data-a="e"]`); $('#pxpu').value = 'g'; set('#pxp', '125'); click('#pxok'); assert.strictEqual(ev('cartTotal()'), 1500); assert.strictEqual(g('Queso'), 5000);
  click(`#cart [data-a="e"]`); $('#pxpu').value = 'g'; set('#pxp', '350'); click('#pxok'); assert.strictEqual(ev('cartTotal()'), 4200);
  // quitar y cancelar no mueven stock
  click(`#cart [data-a="-"]`); assert.strictEqual(ev('cartTotal()'), 0); assert.strictEqual(g('Queso'), 5000);
  pesar('Queso', 350); click('#vaciar'); assert.strictEqual(g('Queso'), 5000);
  pesar('Queso', 350); click('#cobrar'); const s = db().sales[0], it = s.items[0];
  assert(s.total === 4200 && it.tot === 4200 && it.g === 350 && it.qty === 0.35 && it.price === 12000 && it.u === 'kg'); assert.strictEqual(g('Queso'), 4650);

  // ---- ticket: el dato "0,350 kg x $12.000/kg" ----
  w.eval('printTicket(db.sales[0])'); const tk = cant(txt('#pvb'));
  assert(tk.includes('0,350 kg'), 'peso con 3 decimales: ' + tk); assert(/12\.000,00\s*\/kg/.test(tk), 'precio por kg: ' + tk);

  // ---- reportes: kilos y unidades por separado ----
  ev("db.sales.push({id:db.sid++,date:new Date().toISOString(),items:[{id:db.prods[0].id,name:'Unidad suelta',qty:3,price:100,cost:50,lots:[],tot:300}],total:300,pay:'Efectivo'});draw()");
  tab('r'); const kp = cant(txt('#kpis'));
  assert(/Unidades vendidas ?3(?!\.|,)/.test(kp), 'las unidades no suman kilos: ' + kp); assert(/Kilos vendidos ?0,350 kg/.test(kp), 'kilos aparte: ' + kp);
  assert(cant(txt('#hist')).includes('0,350 kg× Queso') && !/0\.35/.test(txt('#hist')), 'historial: ' + txt('#hist'));
  assert(cant(txt('#top')).includes('0,350 kg') && !/0\.35/.test(txt('#top')), 'más vendidos: ' + txt('#top'));
  // suma de kilos sin errores de coma flotante (0,1 + 0,2)
  ev("db.sales.push({id:db.sid++,date:new Date().toISOString(),items:[{id:" + id + ",name:'Queso',qty:0.1,g:100,u:'kg',price:12000,cost:8000,lots:[],tot:1200}],total:1200,pay:'Efectivo'},{id:db.sid++,date:new Date().toISOString(),items:[{id:" + id + ",name:'Queso',qty:0.2,g:200,u:'kg',price:12000,cost:8000,lots:[],tot:2400}],total:2400,pay:'Efectivo'});draw()");
  assert(/Kilos vendidos ?0,650 kg/.test(cant(txt('#kpis'))), cant(txt('#kpis')));
  ev("db.sales.splice(-2,2);draw()");
  // stock bajo en kg, no en "u." con gramos
  ev(`db.prods.find(p=>p.id===${id}).min=6000;draw()`); assert(/Queso ?4,65 kg/.test(cant(txt('#low'))), 'stock bajo: ' + txt('#low'));
  // vencimientos de un producto por peso: kg
  ev(`db.prods.find(p=>p.id===${id}).lots[0].exp=plus(5);draw()`); assert(/4,65 kg/.test(cant(txt('#venc'))), 'vencimientos: ' + txt('#venc')); ev(`db.prods.find(p=>p.id===${id}).lots[0].exp='';draw()`);

  // ---- analítica: sin mezclar y con el total real de cada línea ----
  const an = JSON.parse(ev("JSON.stringify((()=>{const L=AN.lineas(UT.hoy(),UT.hoy());return {k:AN.kpis(L),p:AN.agrupar(L,x=>x.items.map(i=>[i.name,UT.itemTot(i),0,UT.qtyDe(i),UT.esKg(i)]),9)}})())"));
  assert.strictEqual(an.k.unidades, 3, 'unidades sin kilos'); assert.strictEqual(an.k.kilos, 0.35);
  assert.strictEqual(an.p.find(x => x.k === 'Queso').ing, 4200);

  // ---- pantalla de productos: el stock se ve en kg ----
  tab('p');
  ev(`pick(db.prods.find(p=>p.id===${id}))`); assert(/stock actual: 4,65 kg/.test(txt('#ft')), txt('#ft'));

  // ---- corregir una venta por peso: vuelve al carrito con 350 g (no 0,35) y el mismo total ----
  tab('r'); const sid = s.id; click(`#hist [data-c="${sid}"]`); click(`#hist [data-c="${sid}"]`);
  assert.strictEqual(ev(`cart[${id}]`), 350, 'corregir carga gramos'); assert.strictEqual(ev('cartTotal()'), 4200); assert.strictEqual(g('Queso'), 5000, 'el stock vuelve exacto');
  click('#cobrar'); assert.strictEqual(g('Queso'), 4650);
  // por importe: corregir conserva el importe cobrado
  ev(`cart={};cartImp={}`); tab('v'); click(`#prods .p[data-id="${id}"]`); set('#pxi', '5000'); click('#pxok'); click('#cobrar');
  const s2 = db().sales[db().sales.length - 1]; assert(s2.items[0].porImporte && s2.total === 5000);
  tab('r'); click(`#hist [data-c="${s2.id}"]`); click(`#hist [data-c="${s2.id}"]`); assert.strictEqual(ev('cartTotal()'), 5000, 'importe conservado'); assert.strictEqual(ev(`cart[${id}]`), s2.items[0].g);
  click('#vaciar'); assert.strictEqual(g('Queso'), 4650, 'stock exacto tras corregir y vaciar'); assert(Number.isInteger(g('Queso')));

  // ---- anular devuelve exacto aunque se hayan juntado decimales ----
  nuevo('Jamón', 3333.33, '2', 3000); [100, 200, 300, 33].forEach(x => { pesar('Jamón', x); click('#cobrar'); });
  assert.strictEqual(g('Jamón'), 2000 - 633); tab('r');
  db().sales.filter(x => x.items[0].name === 'Jamón').forEach(x => { click(`#hist [data-v="${x.id}"]`); click(`#hist [data-v="${x.id}"]`); });
  assert.strictEqual(g('Jamón'), 2000, 'anular devuelve los gramos exactos');

  // ---- bajas de stock por peso: costo real (500 g a $8.000/kg = $4.000, no $4.000.000) ----
  tab('e'); set('#ep', 'Queso'); ev(`epId=${id}`); set('#eq', '0.5'); click('#ea'); assert(/0,5 kg/.test(cant(txt('#et'))), 'borrador en kg: ' + txt('#et'));
  set('#ej', 'Prueba'); click('#eg'); const baja = db().desv[0];
  assert(baja && baja.items[0].g === 500 && baja.items[0].qty === 0.5, JSON.stringify(baja)); assert.strictEqual(g('Queso'), 4150);
  assert.strictEqual(ev('desvCost(db.desv[0])'), 4000);
  // una baja vieja (en gramos, sin "g") también se cuenta bien
  ev(`db.desv.push({id:db.did++,date:new Date().toISOString(),reason:'Otro',items:[{id:${id},name:'Queso',qty:500,cost:8000,lots:[]}]})`); assert.strictEqual(ev('desvCost(db.desv[1])'), 4000, 'baja vieja en gramos');
  click(`#el [data-v="${baja.id}"]`); click(`#el [data-v="${baja.id}"]`); assert.strictEqual(g('Queso'), 4650, 'anular la baja devuelve el peso');

  // ---- etiquetas de balanza a $12.000/kg: importe $4.200 = 350 g; peso 0,350 kg = $4.200 ----
  const dv = c12 => { let t = 0; for (let i = 0; i < 12; i++) t += +c12[i] * (i % 2 ? 3 : 1); return c12 + (10 - t % 10) % 10; };
  ev(`db.prods.find(p=>p.id===${id}).plu='7'`); ev(`db.cfg.balanza={iPlu:1,nPlu:6,iVal:7,nVal:5,tipo:'importe',dec:0}`); tab('v'); click('#vaciar');
  ev(`onScan('${dv('2000007' + '04200')}')`); assert.strictEqual(ev(`cart[${id}]`), 350); assert.strictEqual(ev('cartTotal()'), 4200); click('#vaciar');
  ev(`db.cfg.balanza={iPlu:1,nPlu:6,iVal:7,nVal:5,tipo:'peso',dec:3}`); ev(`onScan('${dv('2000007' + '00350')}')`); assert.strictEqual(ev(`cart[${id}]`), 350); assert.strictEqual(ev('cartTotal()'), 4200); click('#vaciar');

  // ---- stock mínimo de un producto por peso: se escribe en kg y alerta en kg ----
  tab('p'); click('#fx'); set('#fn', 'Harina'); set('#fp', '900'); set('#fm', '2'); $('#px_u').value = 'kg'; $('#px_u').dispatchEvent(new w.Event('change', { bubbles: true })); set('#fs', '1.5'); click('#fg');
  assert.strictEqual(P('Harina').min, 2000, 'mínimo de 2 kg = 2.000 g'); tab('r'); assert(/Harina ?1,5 kg/.test(cant(txt('#low'))), 'alerta de stock bajo: ' + txt('#low'));
  assert.strictEqual(require('../validar')(null, db()), null);
  assert.deepStrictEqual(errs, []); console.log('ALMACEN_PESO_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
