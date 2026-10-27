// Con mucho volumen las pantallas y las reglas automáticas siguen siendo rápidas.
const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), ev = a.w.eval.bind(a.w), t = f => { const t0 = Date.now(); const r = f(); return [Date.now() - t0, r]; };
  ev(`db.prods.length=0;db.sales.length=0;db.pays.length=0;db.cargos.length=0;db.clients.length=0;db.cid=1;db.sid=1;db.payid=1;db.nid=1;
    for(let i=1;i<=2000;i++)db.prods.push({id:db.nid++,name:'Prod '+i,code:'C'+i,price:100+i%50,cost:60,min:5,lots:[{id:i,n:'L',qty:100,exp:''}]});
    for(let i=1;i<=3000;i++)db.clients.push({id:db.cid++,name:'Cliente '+i,phone:'1155'+i,disc:0});
    const hoy=UT.hoy();for(let i=0;i<60000;i++){const cc=i%3===0,cid=cc||i%5===0?1+(i%3000):undefined,k=UT.add(hoy,-(i%400));
      db.sales.push({id:db.sid++,date:k+'T'+String(8+i%12).padStart(2,'0')+':00:00',items:[{id:1+i%2000,name:'Prod',qty:1+i%3,price:120,cost:60}],total:120*(1+i%3),pay:cc?'Cuenta corriente':'Efectivo',cid,cname:cid?'C':undefined})}
    for(let i=0;i<15000;i++)db.pays.push({id:db.payid++,date:UT.add(hoy,-(i%300))+'T10:00:00',cid:1+(i%3000),amount:150,method:'Efectivo',note:''});`);
  assert.strictEqual(ev('db.sales.length'), 60000);
  // deuda de todos los clientes (la usan Clientes, Inicio, Finanzas y el consolidado)
  let [ms, deuda] = t(() => ev('db.clients.reduce((a,c)=>a+debtOf(c.id),0)')); console.log('  deuda de 3.000 clientes:', ms, 'ms'); assert(ms < 800, ms + ' ms'); assert(deuda > 0);
  // cuentas por antigüedad, segmentos y puntaje de todos los clientes
  [ms] = t(() => ev('const m=CL.mapa();db.clients.map(c=>CL.perfil(c,m))')); console.log('  segmentos + puntaje de 3.000 clientes:', ms, 'ms'); assert(ms < 4000, ms + ' ms');
  // motor de cobros con todas las reglas encendidas
  ev('const R=COB.R();R.multa={on:true,pct:5,gracia:10};R.pronto={on:true,pct:3,dias:5};R.recordatorio={on:true,dias:7,cada:7}');
  [ms] = t(() => ev('COB.correr().cambios')); console.log('  motor de cobros (primera corrida):', ms, 'ms'); assert(ms < 6000, ms + ' ms'); [ms] = t(() => ev('COB.correr().cambios')); assert.strictEqual(ev('COB.correr().cambios'), 0, 'idempotente con volumen'); console.log('  motor de cobros (segunda corrida):', ms, 'ms'); assert(ms < 3000);
  [ms] = t(() => ev('COB.pendientes().length')); console.log('  recordatorios pendientes:', ms, 'ms'); assert(ms < 3000);
  // analítica y finanzas sobre un año de ventas
  [ms] = t(() => ev(`AN.st.per='anio';AN.calc()`)); console.log('  analítica de un año:', ms, 'ms'); assert(ms < 2500);
  [ms] = t(() => ev('FN.balance();FN.flujo(30);FN.resultado(UT.add(UT.hoy(),-30),UT.hoy())')); console.log('  balance + flujo + resultado:', ms, 'ms'); assert(ms < 2500);
  [ms] = t(() => ev('AN.pronostico(30).ok')); console.log('  pronóstico:', ms, 'ms'); assert(ms < 1500);
  // redibujar todo + medición propia del programa
  const m = ev('SY.medir()'); console.log('  guardar', m.guardar, 'ms · cargar', m.cargar, 'ms · dibujar', m.dibujar, 'ms · tamaño', (m.bytes / 1048576).toFixed(1), 'MB'); assert(m.bytes > 5e6); assert(m.guardar < 1500 && m.cargar < 1500);
  // las pantallas originales dibujan todas las filas; en jsdom (mucho más lento que un navegador real) deben seguir siendo usables
  [ms] = t(() => { a.tab('c'); return 1; }); console.log('  abrir Clientes completo (jsdom):', ms, 'ms'); assert(ms < 20000, ms + ' ms');
  [ms] = t(() => ev('CL.draw()')); console.log('  tabla de segmentos, 1.ª vez:', ms, 'ms'); assert(ms < 6000, ms + ' ms'); [ms] = t(() => ev('CL.draw()')); console.log('  tabla de segmentos, repetida (caché):', ms, 'ms'); assert(ms < 1000, ms + ' ms');
  assert.deepStrictEqual(a.errs, []); console.log('rendimiento OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
