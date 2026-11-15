// v3.0.0: se eliminó el cobro automático (recargos por mora, pronto pago y cuotas recurrentes).
// Se verifica que ya no se generan cargos, que lo generado antes se conserva y que los recordatorios de deuda siguen funcionando.
const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w), J = e => JSON.parse(w.eval('JSON.stringify(' + e + ')'));
  ev('db.cfg.avanzado=true;draw()');   // Finanzas completa es una función avanzada
  const hoy = ev('UT.hoy()'), ago = n => ev(`UT.add('${hoy}',${-n})`);
  ev('db.sales.length=0;db.pays.length=0;db.cargos.length=0;db.clients.length=0;db.cid=1;db.sid=1;db.cgid=1;db.avisos.length=0');
  ev(`db.clients.push({id:db.cid++,name:'Moroso',phone:'+54 9 341 555-1234',mail:'m@x.com',disc:0},{id:db.cid++,name:'Puntual',phone:'',disc:0})`);
  const venta = (cid, dias, total) => ev(`db.sales.push({id:db.sid++,date:'${ago(dias)}T12:00:00.000Z',items:[{id:1,name:'P',qty:1,price:${total},cost:0}],total:${total},pay:'Cuenta corriente',cid:${cid}})`);
  venta(1, 75, 1000); venta(2, 2, 1000);

  // Datos de una versión anterior: reglas activadas, un recurrente programado y cargos ya generados.
  ev(`Object.assign(COB.R(),{multa:{on:true,pct:5,gracia:10},pronto:{on:true,pct:3,dias:5}})`);
  ev(`db.rec.push({id:db.recid++,cid:2,desc:'Abono',monto:200,frec:'mensual',desde:'${ev(`UT.addMes('${hoy}',-2)`)}',activo:true})`);
  ev(`db.cargos.push({id:db.cgid++,cid:1,date:'${ago(30)}T12:00:00.000Z',desc:'Recargo por mora',amount:50,tipo:'multa',ref:'multa:v1:1',nro:1},{id:db.cgid++,cid:2,date:'${ago(1)}T12:00:00.000Z',desc:'Descuento por pronto pago',amount:-30,tipo:'pronto',ref:'pronto:v2',refVenta:'v2'})`);
  const cargos0 = JSON.stringify(J('db.cargos'));

  // El motor ya no genera ni quita cargos, aunque las reglas viejas estén activadas.
  assert.deepStrictEqual(J('COB.correr()'), { recurrentes: 0, multas: 0, pronto: 0, quitados: 0, cambios: 0 });
  ev('COB.arranque()'); a.tab('v'); ev('add(1)'); a.click('#cobrar'); a.tab('c'); ev('cSel=1;draw()'); a.set('#cm', '10'); a.click('#cpay');
  await new Promise(r => setTimeout(r, 30));
  assert.strictEqual(JSON.stringify(J('db.cargos')), cargos0, 'vender, cobrar o arrancar no generan cargos y no se borra el historial');
  assert.strictEqual(ev('debtOf(1)'), 1040, 'el recargo viejo sigue en la cuenta (1000 + 50 − 10)');

  // Pantalla: sin reglas de mora/pronto pago ni cobros recurrentes; el historial y su comprobante se conservan.
  a.tab('f'); a.click('#fnp [data-s=c]'); const t = a.txt('#f_cobros');
  assert(/Recordatorios/.test(a.txt('#fnp')) && !/>Cobros</.test($('#fnp').innerHTML));
  assert(!$('#rg_m') && !$('#rg_p') && !$('#rc_g') && !$('#rg_e'), 'no quedan controles de cobro automático');
  assert(/ya no se generan solos/.test(t), 'avisa del recurrente que quedó programado');
  assert(/historial/.test(t) && /Recargo por mora/.test(t) && $('#f_cobros [data-pdf]'), 'historial con comprobante');
  ev(`db.cfg.encuesta={fiscal:{imp:'IVA',tasa:21,id:'CUIT'}}`); const html = ev(`COB.comprobante(db.cargos.find(c=>c.tipo==='multa'))`); assert(/IVA 21%/.test(html) && /no reemplaza una factura fiscal/i.test(html));

  // Recordatorios de deuda (no cobran nada): siguen funcionando.
  ev('db.cfg.encuesta=null;COB.R().recordatorio={on:true,dias:7,cada:7};COB.R().linkPago="https://pago.example/p?m={monto}&c={cliente}"');
  let P = J('COB.pendientes().map(x=>({n:x.c.name,m:x.msg,s:x.saldo}))'); assert.deepStrictEqual(P.map(x => x.n), ['Moroso']);
  assert(/Hola Moroso/.test(P[0].m) && /75 días/.test(P[0].m) && /pago\.example\/p\?m=1040&c=Moroso/.test(P[0].m), P[0].m);
  ev("$('#f_cobros').dataset.k='';draw()"); assert(/Recordatorios pendientes \(1\)/.test(a.txt('#f_cobros')) && $('#f_cobros [data-wa]') && $('#f_cobros [data-ml]'));
  let abierto = ''; w.open = u => { abierto = u }; a.click($('#f_cobros [data-wa]')); assert(abierto.startsWith('https://wa.me/549341555') && /text=Hola%20Moroso/.test(abierto), abierto);
  a.click($('#f_cobros [data-ok]')); assert.strictEqual(ev('COB.pendientes().length'), 0, 'después de enviarlo no se repite'); assert.strictEqual(a.db().avisos.length, 1);
  a.set('#rg_dias', '30'); a.click('#rg_g'); assert.strictEqual(a.db().rules.recordatorio.dias, 30); assert.strictEqual(JSON.stringify(J('db.cargos')), cargos0, 'guardar no genera cargos');

  assert.deepStrictEqual(a.errs, []);
  console.log('cobros OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
