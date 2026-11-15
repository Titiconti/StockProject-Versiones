const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w), J = e => JSON.parse(w.eval('JSON.stringify(' + e + ')'));
  ev('db.cfg.avanzado=true;draw()');   // Analítica es una función avanzada: oculta por defecto
  const hoy = ev('UT.hoy()');
  ev('db.sales.length=0;db.pays.length=0;db.sid=1');
  // 90 días con patrón semanal fijo (domingo..sábado) y dos productos; los últimos 30 días venden el doble de unidades de "Yerba"
  const patron = [200, 500, 600, 600, 700, 1200, 1500];
  ev(`const pat=${JSON.stringify(patron)};for(let i=0;i<90;i++){const k=UT.add('${hoy}',-i),dw=new Date(k+'T12:00:00').getDay(),t=pat[dw];
    db.sales.push({id:db.sid++,date:k+'T10:30:00',items:[{id:1,name:'Yerba',qty:1,price:t*0.6,cost:t*0.3},{id:2,name:'Azúcar',qty:2,price:t*0.2,cost:t*0.1}],total:t*0.6+2*t*0.2,pay:i%2?'Efectivo':'Tarjeta',cid:i%3?undefined:1,cname:i%3?undefined:'Cli'});}`);
  a.tab('a'); const S = () => J('AN.ult');
  a.set('#an_p', '7'); let r = S(); assert.strictEqual(r.g, 'dia'); assert.strictEqual(r.S.bs.length, 7);
  const esp7 = Array.from({ length: 7 }, (_, i) => patron[new Date(ev(`UT.add('${hoy}',${-i})`) + 'T12:00:00').getDay()] * 1.0).reduce((x, y) => x + y, 0); // total = t*0.6+t*0.4
  assert.strictEqual(Math.round(r.K.ventas), esp7); assert.strictEqual(r.K.n, 7);
  assert(r.pr && r.Kp.n === 7, 'compara contra los 7 días anteriores'); assert(/vs\. período anterior/.test(a.txt('#an_out')) && /Tendencia por día/.test(a.txt('#an_out')));
  // filtros
  a.set('#an_p', '30'); a.set('#an_pg', 'Tarjeta'); r = S(); assert(r.K.n >= 14 && r.K.n <= 16, 'solo tarjeta: ' + r.K.n); assert.deepStrictEqual(r.pay.map(x => x.k), ['Tarjeta']);
  a.set('#an_pg', ''); a.set('#an_cl', '1'); r = S(); assert(r.K.n >= 9 && r.K.n <= 11 && r.cli[0].k === 'Cli');
  a.set('#an_cl', ''); a.set('#an_pr', 'azúcar'); r = S(); assert.deepStrictEqual(r.prod.map(x => x.k), ['Azúcar'], 'el filtro de producto cuenta solo sus renglones'); assert(Math.abs(r.K.ventas - UT_sum('Azúcar')) < 1);
  function UT_sum(n) { return J(`UT.ventas(UT.add('${hoy}',-29),'${hoy}')`).reduce((s, v) => s + v.items.filter(i => i.name === n).reduce((x, i) => x + i.qty * i.price, 0), 0); }
  a.click('#an_lp'); r = S(); assert.strictEqual(r.K.n, 30); assert.strictEqual(r.pay.length, 2);
  // ganancia y margen
  assert(Math.abs(r.K.ganancia - r.K.ventas * 0.5) < 1 && Math.abs(r.K.margen - 50) < 0.1);
  // período a elegir y mes anterior
  a.set('#an_p', 'mesant'); r = S(); assert.strictEqual(r.d.slice(8), '01'); assert(r.h < hoy.slice(0, 8) + '01');
  a.set('#an_p', 'custom'); a.set('#an_d', ev(`UT.add('${hoy}',-10)`)); a.set('#an_h', ev(`UT.add('${hoy}',-4)`)); r = S(); assert.strictEqual(r.K.n, 7);
  a.set('#an_cmp', 'anio'); r = S(); assert.strictEqual(r.pr[0], ev(`UT.addMes('${r.d}',-12)`)); assert.strictEqual(r.Kp.n, 0, 'sin datos del año anterior'); a.set('#an_cmp', 'no'); assert.strictEqual(S().pr, null);
  // tendencia semanal/mensual y drill-down al tocar una barra
  a.set('#an_cmp', 'ant'); a.set('#an_p', '90'); a.set('#an_g', 'semana'); r = S(); assert(r.S.bs.length >= 13 && r.S.bs.every(b => new Date(b + 'T12:00:00').getDay() === 1), 'semanas desde el lunes');
  assert.strictEqual(Math.round(r.S.v.reduce((x, y) => x + y, 0)), Math.round(r.K.ventas));
  a.click($('#an_out [data-i="3"]')); r = S(); assert.strictEqual(a.db === undefined, false); assert.strictEqual(r.g, 'dia'); assert.strictEqual(r.S.bs.length <= 7, true, 'baja a esa semana');
  // pronóstico con estacionalidad semanal conocida
  const p = J('AN.pronostico(30)'); assert(p.ok); const esperado7 = patron.reduce((x, y) => x + y, 0); assert(Math.abs(p.prox7 - esperado7) / esperado7 < 0.08, `${p.prox7} vs ${esperado7}`);
  assert(p.error < 8, 'error medido: ' + p.error); assert(Math.abs(p.prox30 - esperado7 * 30 / 7) / (esperado7 * 30 / 7) < 0.1);
  const lunes = p.serie.find(x => new Date(x.k + 'T12:00:00').getDay() === 0), sab = p.serie.find(x => new Date(x.k + 'T12:00:00').getDay() === 6); assert(sab.v > 4 * lunes.v, 'respeta que el sábado vende mucho más que el domingo');
  ev('db.sales.length=3'); assert.strictEqual(J('AN.pronostico(30)').ok, false, 'con pocos datos no inventa un pronóstico');
  // exportaciones
  ev('db.sales.length=0'); ev('UT.bajar=(n,t)=>{window.__f=[n,t]}'); a.click('#an_csv'); const [nom, csv] = ev('window.__f'); assert(/^analitica-.*\.csv$/.test(nom) && /Indicador;Valor/.test(csv));
  assert.deepStrictEqual(a.errs, []);
  console.log('analitica OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
