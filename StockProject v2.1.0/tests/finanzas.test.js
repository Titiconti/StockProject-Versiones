const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w), hoy = ev('UT.hoy()'), J = e => JSON.parse(w.eval('JSON.stringify(' + e + ')'));
  // ---- utilidades de importación ----
  const N = s => ev(`UT.num(${JSON.stringify(s)})`);
  assert.deepStrictEqual([N('1.234,56'), N('1,234.56'), N('$ 1.500'), N('12,5'), N('-50,25'), N('1234'), N('')], [1234.56, 1234.56, 1500, 12.5, -50.25, 1234, null]); assert(Number.isNaN(N('abc')));
  const F = s => ev(`UT.fecha(${JSON.stringify(s)})`);
  assert.deepStrictEqual([F('05/03/2026'), F('2026-3-5'), F('5-3-26'), F('')], ['2026-03-05', '2026-03-05', '2026-03-05', null]); assert(Number.isNaN(F('31/02/2026')) && Number.isNaN(F('hola')));
  const P = J(`UT.parseCSV('\\ufeffnombre;precio;nota\\n"Yerba ""Rosa""";1.500,50;"línea1\\nlínea2"\\n\\n;;\\nAzúcar;900;')`);
  assert.strictEqual(P.delim, ';'); assert.deepStrictEqual(P.rows[1], ['Yerba "Rosa"', '1.500,50', 'línea1\nlínea2']); assert.strictEqual(P.rows.length, 3, 'ignora filas vacías');
  assert.strictEqual(ev(`UT.parseCSV('a,b\\n1,2').delim`), ',');

  // ---- libro, saldos y resultado ----
  ev(`db.fin.apertura={Caja:1000,Banco:0};
    const mk=(id,pay,total,extra)=>db.sales.push(Object.assign({id,date:new Date().toISOString(),items:[{id:1,name:'P',qty:1,price:total,cost:total*0.6}],total,pay},extra||{}));
    db.sales.length=0;db.pays.length=0;
    mk(1,'Efectivo',1000);mk(2,'Transferencia',2000);mk(3,'Cuenta corriente',500,{cid:1,cname:'x'});mk(4,'Efectivo',300,{void:true});
    db.pays.push({id:1,date:new Date().toISOString(),cid:1,amount:200,method:'Efectivo',note:''});
    db.fin.mov.push({id:1,fecha:'${hoy}',tipo:'gasto',cat:'Alquiler',desc:'Mes',monto:400,cta:'Caja'},{id:2,fecha:'${hoy}',tipo:'gasto',cat:'Mercadería',desc:'Compra',monto:100,cta:'Caja'});
    db.fin.pagar.push({id:3,prov:'Prov',desc:'',monto:700,vence:'${hoy}',pagado:false});`);
  assert.deepStrictEqual(J('FN.saldos()'), { Caja: 1000 + 1000 + 200 - 400 - 100, Banco: 2000 });
  const R = J(`FN.resultado('${hoy.slice(0, 8)}01','${hoy}')`);
  assert.strictEqual(R.ventas, 3500, 'incluye ventas en cuenta corriente, excluye anuladas'); assert.strictEqual(R.costo, 2100);
  assert.deepStrictEqual(R.gastos, { Alquiler: 400 }, 'compras de mercadería no son gasto del resultado'); assert.strictEqual(R.neto, 3500 - 2100 - 400);
  ev(`FN.pagados`); ev(`db.fin.pagar[0].pagado=true;db.fin.pagar[0].pagoFecha='${hoy}';db.fin.pagar[0].cta='Banco'`); assert.strictEqual(ev('FN.saldos().Banco'), 1300, 'pago a proveedor sale del banco'); ev(`db.fin.pagar[0].pagado=false`);
  const B = J('FN.balance()'); assert.strictEqual(B.porPagar, 700); assert.strictEqual(B.cobrar, 300, 'deuda: 500 - 200'); assert.strictEqual(B.patrimonio, B.act - B.pas);
  // flujo: el pago a proveedor de hoy se descuenta en el primer día proyectado
  const fl = J('FN.flujo(30)'); assert.strictEqual(fl.serie.length, 30); assert(fl.serie[0].saldo < fl.hoy + fl.ingDia, 'se descuenta la cuenta a pagar');
  assert(J('FN.alertas()').some(x => /vencen en los próximos 3 días|vencido/i.test(x)), 'alerta de pago');

  // ---- conciliación ----
  const d3 = ev(`UT.add('${hoy}',-1)`).split('-').reverse().join('/'), d5 = hoy.split('-').reverse().join('/');
  const csv = `Fecha;Descripción;Importe\n${d3};Transferencia cliente;2.000,00\n${d5};Comisión;-45,50\n${d5};Movimiento raro;;\n`;
  const r = J(`FN.leerExtracto(${JSON.stringify(csv)})`); assert.strictEqual(r.lineas.length, 2); assert.strictEqual(r.omitidas.length, 1);
  assert.strictEqual(ev(`FN.importarExtracto(${JSON.stringify(r.lineas)})`), 2); assert.strictEqual(ev(`FN.importarExtracto(${JSON.stringify(r.lineas)})`), 0, 'no duplica al volver a cargar');
  assert.strictEqual(ev('FN.conciliar()'), 1); const bk = a.db().fin.banco; assert(bk.find(b => b.monto === 2000).ref === 'v2' && !bk.find(b => b.monto === -45.5).ref);
  const csv2 = `Fecha,Débito,Crédito,Detalle\n${d5},50,,Pago\n${d5},,75.5,Depósito`; const r2 = J(`FN.leerExtracto(${JSON.stringify(csv2)})`); assert.deepStrictEqual(r2.lineas.map(l => l.monto), [-50, 75.5], 'columnas débito/crédito separadas');

  // ---- sueldos ----
  ev(`db.fin.emp.push({id:9,nombre:'Ana',sueldo:1500},{id:10,nombre:'Beto',sueldo:1200})`); assert.strictEqual(ev(`FN.liquidar('${hoy.slice(0, 7)}')`), 2); assert.strictEqual(ev(`FN.liquidar('${hoy.slice(0, 7)}')`), 0, 'no duplica');
  assert.strictEqual(ev(`db.fin.mov.filter(m=>m.cat==='Sueldos').length`), 2);

  // ---- pantalla ----
  a.tab('f'); const txt = s => a.txt(s);
  assert(/Ganancia bruta/.test(txt('#f_res')) && /Patrimonio/.test(txt('#f_bal')) && $('#f_fl svg') && /Por pagar/.test(txt('#f_k')));
  a.click('#fnp [data-s=l]'); a.set('#m_m', '250'); a.set('#m_d', 'Luz'); a.click('#m_g'); assert(a.db().fin.mov.some(m => m.desc === 'Luz' && m.monto === 250));
  let csvOut = ''; ev('UT.bajar=(n,t)=>{window.__csv=t}'); a.click('#l_x'); csvOut = ev('window.__csv'); assert(/Fecha;Tipo;Categoría/.test(csvOut) && /Luz/.test(csvOut));
  a.click('#fnp [data-s=p]'); a.set('#gp_p', 'Distribuidora'); a.set('#gp_m', '999'); a.click('#gp_g'); assert(/Distribuidora/.test(txt('#f_pg')));
  const pg = $('#f_pg [data-pg]'); a.click(pg); assert(a.db().fin.pagar.some(g => g.prov === 'Prov' && g.pagado || g.prov === 'Distribuidora' && g.pagado), 'se registra el pago');
  assert.deepStrictEqual(a.errs, [], 'sin errores');
  console.log('finanzas OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
