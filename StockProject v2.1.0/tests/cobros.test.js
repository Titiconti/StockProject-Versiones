const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w), J = e => JSON.parse(w.eval('JSON.stringify(' + e + ')'));
  const hoy = ev('UT.hoy()'), ago = n => ev(`UT.add('${hoy}',${-n})`);
  ev('db.sales.length=0;db.pays.length=0;db.cargos.length=0;db.clients.length=0;db.cid=1;db.sid=1;db.cgid=1;db.avisos.length=0');
  ev(`db.clients.push({id:db.cid++,name:'Moroso',phone:'+54 9 341 555-1234',mail:'m@x.com',disc:0},{id:db.cid++,name:'Puntual',phone:'',disc:0})`);
  const venta = (cid, dias, total) => ev(`db.sales.push({id:db.sid++,date:'${ago(dias)}T12:00:00.000Z',items:[{id:1,name:'P',qty:1,price:${total},cost:0}],total:${total},pay:'Cuenta corriente',cid:${cid},cname:'x'})`);
  const pago = (cid, monto) => ev(`db.pays.push({id:(db.payid=(db.payid||0)+1),date:new Date().toISOString(),cid:${cid},amount:${monto},method:'Efectivo',note:''})`);
  venta(1, 75, 1000); venta(2, 2, 1000);
  // reglas apagadas: no hace nada
  assert.strictEqual(ev('COB.correr().cambios'), 0);
  // recargo por mora: 5% cada 30 días pasados los 10 de gracia. A los 75 días: períodos 1 (11-40), 2 (41-70), 3 (71-100)
  ev('const R=COB.R();R.multa={on:true,pct:5,gracia:10}'); let r = J('COB.correr()'); assert.strictEqual(r.multas, 3);
  assert.deepStrictEqual(J('db.cargos.map(c=>c.amount)'), [50, 50, 50]); assert.strictEqual(ev('debtOf(1)'), 1150); assert.strictEqual(ev('debtOf(2)'), 1000, 'el puntual no tiene recargo');
  assert.strictEqual(J('COB.correr()').cambios, 0, 'idempotente: correrlo de nuevo no duplica'); assert.strictEqual(ev('db.cargos.length'), 3);
  assert(J('db.cargos')[0].nro, 'los recargos llevan número de comprobante');
  // un plan de pagos vigente (sin cuotas vencidas) suspende nuevos recargos
  ev('db.cargos.length=0'); ev(`CL.crearPlan(1,{monto:1000,n:2,primer:'${ago(-10)}',cada:30})`); assert.strictEqual(J('COB.correr()').multas, 0, 'con plan al día no se recarga'); ev(`db.planes[0].estado='cancelado'`);
  ev('db.planes.length=0;db.cargos.length=0;COB.R().multa.on=false');
  // pronto pago: 3% si paga el resto dentro de 5 días
  ev('COB.R().pronto={on:true,pct:3,dias:5}'); pago(2, 970); r = J('COB.correr()'); assert.strictEqual(r.pronto, 1); assert.strictEqual(ev('debtOf(2)'), 0, 'se acredita el 3% y queda saldada');
  assert.strictEqual(J('COB.correr()').cambios, 0);
  ev('db.pays.length=0'); r = J('COB.correr()'); assert.strictEqual(r.quitados, 1, 'si se anula el pago se retira el descuento'); assert.strictEqual(ev('debtOf(2)'), 1000);
  pago(2, 500); assert.strictEqual(J('COB.correr()').pronto, 0, 'pagando menos del 97% no hay descuento'); ev('db.pays.length=0');
  // recurrentes: se generan los períodos vencidos una sola vez
  ev(`db.rec.push({id:db.recid++,cid:2,desc:'Abono',monto:200,frec:'mensual',desde:'${ev(`UT.addMes('${hoy}',-2)`)}',activo:true})`);
  assert.strictEqual(J('COB.correr()').recurrentes, 3, 'hace 2 meses, hace 1 mes y hoy'); assert.strictEqual(J('COB.correr()').recurrentes, 0);
  ev('db.rec[0].activo=false;db.rec[0].desde=UT.add(UT.hoy(),-400)'); assert.strictEqual(J('COB.correr()').recurrentes, 0, 'pausado no genera');
  assert.strictEqual(ev(`UT.addMes('2026-01-31',1)`), '2026-02-28', 'fin de mes');
  // dos dispositivos que generaron el mismo cargo: queda uno solo
  ev(`db.cargos.push({...db.cargos.find(c=>c.ref),id:db.cgid++})`); const n = ev('db.cargos.length'); ev('COB.correr()'); assert.strictEqual(ev('db.cargos.length'), n - 1);
  // recordatorios
  ev('db.cargos.length=0;db.rec.length=0;COB.R().recordatorio={on:true,dias:7,cada:7};COB.R().linkPago="https://pago.example/p?m={monto}&c={cliente}"');
  let P = J('COB.pendientes().map(x=>({n:x.c.name,m:x.msg,s:x.saldo}))'); assert.deepStrictEqual(P.map(x => x.n), ['Moroso']); assert.strictEqual(P[0].s, 1000);
  assert(/Hola Moroso/.test(P[0].m) && /75 días/.test(P[0].m) && /pago\.example\/p\?m=1000&c=Moroso/.test(P[0].m), P[0].m);
  a.tab('f'); a.click('#fnp [data-s=c]'); assert(/Recordatorios pendientes \(1\)/.test(a.txt('#f_cobros')) && $('#f_cobros [data-wa]') && $('#f_cobros [data-ml]'));
  let abierto = ''; w.open = u => { abierto = u }; a.click($('#f_cobros [data-wa]')); assert(abierto.startsWith('https://wa.me/549341555') && /text=Hola%20Moroso/.test(abierto), abierto);
  a.click($('#f_cobros [data-ok]')); assert.strictEqual(ev('COB.pendientes().length'), 0, 'después de enviarlo no se repite'); assert.strictEqual(a.db().avisos.length, 1);
  // regla guardada desde la pantalla + recurrente desde la pantalla
  a.set('#rg_mp', '8'); a.set('#rg_m', '1'); a.click('#rg_g'); assert.strictEqual(a.db().rules.multa.pct, 8); assert(a.db().cargos.some(c => c.tipo === 'multa'), 'al guardar se aplican las reglas');
  a.set('#rc_c', '2'); a.set('#rc_d', 'Mantenimiento'); a.set('#rc_m', '300'); a.click('#rc_g'); assert(a.db().rec.some(r => r.desc === 'Mantenimiento') && a.db().cargos.some(c => c.tipo === 'recurrente' && c.cid === 2));
  // comprobante con impuesto incluido
  ev(`db.cfg.encuesta={fiscal:{imp:'IVA',tasa:21,id:'CUIT'}}`); const html = ev(`COB.comprobante(db.cargos.find(c=>c.tipo==='recurrente'))`); assert(/IVA 21%/.test(html) && /no reemplaza una factura fiscal/i.test(html));
  assert.deepStrictEqual(a.errs, []);
  console.log('cobros OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
