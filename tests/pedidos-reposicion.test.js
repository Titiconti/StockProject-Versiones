// Pedidos inteligentes (v3.0.0, fase 2): recomendaciones con datos reales y circuito pedido → recepción → factura → pago.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, tab, db, errs } = web();
  const J = e => JSON.parse(w.eval(`JSON.stringify(${e})`)), rec = id => J('RP.calc()').find(x => x.id === id);
  const hoy = w.eval('UT.hoy()'), libro = () => J(`FN.libro('2000-01-01','${hoy}')`);
  // Pan lactal sin stock y sin ventas: se sugiere por el mínimo (3) con prioridad alta y precisión baja
  let r = rec(6); assert(r && r.pri === 'alta' && r.sug === 6 && r.prec === 'baja' && /stock mínimo/.test(r.motivo));
  // Coca-Cola: 10 vendidas en 30 días → consumo diario y objetivo (7 + 14 días)
  w.eval("db.sales.push({id:500,date:new Date().toISOString(),items:[{id:1,name:'Coca-Cola 1,5 L',qty:10,price:2800,cost:1900,lots:[]}],total:28000,pay:'Efectivo'})");
  assert.strictEqual(rec(1), undefined, 'Coca-Cola: 24 en stock cubren 10/30 por día durante 21 días: no se sugiere');
  // Agua: vende mucho; lo que ya está en camino se descuenta de lo sugerido
  w.eval("db.sales.push({id:501,date:new Date().toISOString(),items:[{id:2,name:'Agua',qty:120,price:1200,cost:700,lots:[]}],total:144000,pay:'Efectivo'})");
  const sinPedido = rec(2).sug; assert(sinPedido > 0 && /vendió 120/.test(rec(2).motivo));

  // crear el pedido desde la sugerencia: no se registra ningún gasto ni pago
  tab('o'); $('#os').value = 'Distribuidora Sur'; click(`#rp_l [data-rpa="2"]`); assert.strictEqual(w.eval('draft[0].qty'), sinPedido);
  const libro0 = libro().length; click('#og');
  const o = db().orders[0]; assert(o.items[0].cost === 700 && o.supplier === 'Distribuidora Sur', 'guarda costo estimado y proveedor');
  assert.strictEqual(libro().length, libro0, 'pedir no es pagar'); assert.strictEqual(db().fin.pagar.length, 0);
  assert.strictEqual(rec(2) ? rec(2).sug : 0, 0, 'lo pedido cubre la sugerencia: no se vuelve a pedir');

  // recibir parte con costo nuevo y factura del proveedor
  click(`#ol [data-rv="${o.id}"]`); w.eval(`$("#ol [data-r='0']").value='20';$("#ol [data-c='0']").value='750';$('#ofi').value='37500';$('#ofv').value='${hoy}'`);
  const st0 = J('tot(db.prods.find(p=>p.id===2))'); click(`#ol [data-ok="${o.id}"]`);
  assert.strictEqual(J('tot(db.prods.find(p=>p.id===2))'), st0 + 20, 'entra al inventario'); assert.strictEqual(db().prods.find(p => p.id === 2).cost, 750, 'costo actualizado porque se editó');
  const g = db().fin.pagar[0]; assert(g && g.monto === 37500 && !g.pagado && g.ord === o.id, 'factura a pagar enlazada al pedido');
  assert.strictEqual(libro().length, libro0, 'la factura es una deuda, todavía no un pago');
  // pagar la factura: un solo gasto en el libro
  w.eval(`(()=>{const x=db.fin.pagar[0];x.pagado=true;x.pagoFecha=UT.hoy();x.cta='caja'})()`);
  const gastos = libro().filter(m => m.ref === 'g' + g.id); assert.strictEqual(gastos.length, 1); assert.strictEqual(gastos[0].monto, 37500);
  // una segunda recepción sin importe no crea otra factura
  click(`#ol [data-rv="${o.id}"]`); w.eval(`$("#ol [data-r='0']").value='1'`); click(`#ol [data-ok="${o.id}"]`); assert.strictEqual(db().fin.pagar.length, 1, 'sin duplicados');

  assert.deepStrictEqual(errs, []);
  console.log('REPOSICION_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
