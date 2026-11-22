const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), { $, w } = a, ev = w.eval.bind(w), J = e => JSON.parse(w.eval('JSON.stringify(' + e + ')'));
  const UT_r = n => Math.round(n * 100) / 100, hoy = ev('UT.hoy()'), ago = n => ev(`UT.add('${hoy}',${-n})`);
  ev('db.sales.length=0;db.pays.length=0;db.cargos.length=0;db.clients.length=0;db.cid=1;db.sid=1');
  const cli = n => ev(`db.clients.push({id:db.cid++,name:'${n}',phone:'1155',disc:0,note:''})`) && ev('db.clients[db.clients.length-1].id');
  const venta = (cid, dias, total, pay = 'Efectivo') => ev(`db.sales.push({id:db.sid++,date:'${ago(dias)}T12:00:00.000Z',items:[{id:1,name:'P',qty:1,price:${total},cost:${total * 0.5}}],total:${total},pay:'${pay}',cid:${cid},cname:'x'})`);
  const A = cli('Ana'), B = cli('Beto'), C = cli('Carla'), D = cli('Dario'), E = cli('Eva');
  for (let i = 0; i < 12; i++) venta(A, i * 7 + 1, 1000);          // compra todas las semanas
  venta(B, 3, 500);                                                // primera compra reciente
  venta(C, 250, 800);                                              // hace mucho
  for (let i = 0; i < 3; i++) venta(E, 100 + i * 20, 300);         // compraba, ya no
  const seg = id => J(`CL.perfil(cl$(${id}))`);
  assert.strictEqual(seg(A).seg === 'Campeón' || seg(A).seg === 'Leal', true, 'Ana: ' + seg(A).seg);
  assert.strictEqual(seg(B).seg, 'Nuevo'); assert.strictEqual(seg(C).seg, 'Inactivo'); assert.strictEqual(seg(D).seg, 'Sin compras'); assert.strictEqual(seg(E).seg, 'En riesgo');
  assert(seg(A).ltv > seg(A).gain, 'el valor de vida suma proyección'); assert.strictEqual(seg(D).ltv, 0);
  // puntaje de crédito: una deuda vieja y grande lo baja
  const base = seg(A).score; venta(A, 120, 9000, 'Cuenta corriente'); ev('draw()'); const mal = seg(A);
  assert(mal.score < base - 20 && mal.riesgo !== 'Bajo', `${base} -> ${mal.score}`); assert(mal.cuenta.masVieja >= 119 && mal.cuenta.edades.d90 === 9000);
  // planes de pago
  const r = J(`CL.crearPlan(${A},{monto:9000,n:3,primer:'${ago(-30)}',cada:30,interes:10})`); assert(r.ok); assert.strictEqual(r.plan.total, 9900); assert.strictEqual(r.plan.cuotas.reduce((s, q) => s + q.monto, 0), 9900);
  assert.strictEqual(J('db.cargos').find(c => c.tipo === 'interes').amount, 900, 'el interés se carga a la cuenta'); assert.strictEqual(ev(`debtOf(${A})`), 9900);
  assert.strictEqual(J('CL.cuotasPend()').length, 3);
  { const f1 = J('FN.flujo(40).serie'); ev("db.planes[0].estado='cancelado'"); const f2 = J('FN.flujo(40).serie'); ev("db.planes[0].estado='activo'"); assert.strictEqual(UT_r(f1[39].saldo - f2[39].saldo), 3300, 'la primera cuota del plan entra al flujo proyectado'); }
  ev(`db.pays.push({id:db.payid++||1,date:new Date().toISOString(),cid:${A},amount:3300,method:'Efectivo',note:''})`); const pp = J('CL.cuotasPend()'); assert.strictEqual(pp.length, 2, 'una cuota cubierta con el pago');
  assert(!J(`CL.crearPlan(${A},{monto:0,n:3,primer:'${hoy}'})`).ok);
  const ics = ev(`CL.ics(cl$(${A}))`); assert((ics.match(/BEGIN:VEVENT/g) || []).length === 2 && /TRIGGER:-P1D/.test(ics)); assert(/FN:Ana/.test(ev(`CL.vcf([cl$(${A})])`)));
  // fidelización: puntos, canje y nivel
  ev('db.cfg.fidel=undefined;const f=db.cfg.fidel=CL.fid();f.on=true;f.minCanje=10;f.pesosPorPunto=100;'); const pts = seg(B).puntos; assert.strictEqual(pts, 5);
  assert(!J(`CL.canjear(${B},3)`).ok, 'bajo el mínimo'); ev('CL.fid().minCanje=2'); assert(!J(`CL.canjear(${B},9)`).ok, 'más de los que tiene'); assert(J(`CL.canjear(${B},4)`).ok);
  assert.strictEqual(seg(B).puntos, 1); assert.strictEqual(ev(`debtOf(${B})`), -4, 'queda saldo a favor'); assert.strictEqual(seg(A).nivel.n, 'Bronce'); venta(A, 2, 40000); assert.strictEqual(seg(A).nivel.n, 'Plata', '610 puntos acumulados'); assert.strictEqual(seg(A).nivel.desc, 3);
  // límite de crédito en Ventas
  ev(`cl$(${D}).limite=1000`); ev(`setClient(${D})`); ev(`add(db.prods.find(p=>avail(p)>5).id)`); const total = ev('cartTotal()'); assert(total > 0);
  ev(`cl$(${D}).limite=${Math.floor(total / 2)}`); $('#pay').value = 'Cuenta corriente'; const n0 = a.db().sales.length; a.click('#cobrar');
  assert.strictEqual(a.db().sales.length, n0, 'no vende por encima del límite'); assert(/límite de crédito/.test($('#toast').textContent));
  ev(`cl$(${D}).limite=${total + 1}`); a.click('#cobrar'); assert.strictEqual(a.db().sales.length, n0 + 1, 'dentro del límite sí');
  // pantalla: ficha, segmento filtrable, contactos, planes
  a.tab('c'); ev(`cSel=${E};draw()`); assert(/Segmento/.test(a.txt('#c_x')) && /En riesgo/.test(a.txt('#c_x')));
  assert.strictEqual($('#c_x details.dt[open]'), null, 'la ficha abre con todo plegado: solo lo esencial a la vista');
  a.set('#in_t', 'Le escribí por WhatsApp'); a.click('#in_g'); assert(a.db().inter.some(i => i.cid === E && /WhatsApp/.test(i.txt))); assert(/WhatsApp/.test(a.txt('#c_x')));
  $('#cs_det').open = true; a.ev($('#cs_det'), 'toggle'); a.set('#cs_f', 'En riesgo'); assert(/Eva/.test(a.txt('#cs_t')) && !/Carla/.test(a.txt('#cs_t')));
  assert.strictEqual($('#pl_g'), null, 'v3: el plan de pagos ya no se crea desde la ficha'); assert.strictEqual($('#cx_lim'), null, 'v3: el límite de crédito ya no se carga desde la ficha');
  assert.deepStrictEqual(a.errs, []);
  console.log('clientes2 OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
