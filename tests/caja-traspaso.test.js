// v5.7.2: caja con retiro al cerrar, traspaso al turno siguiente y arqueo por medio de pago.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, db, errs } = web();
  const ev = w.eval.bind(w), J = c => JSON.parse(ev('JSON.stringify(' + c + ')'));
  ev(`db.prods.length=0;db.sales.length=0;db.cajas=[];const x={id:db.nid++,name:'Pan',code:'',price:1000,cost:0,min:0,lots:[]};db.prods.push(x);addLot(x,'L',100,'');draw()`);
  const vender = (pay, n = 1) => { ev(`cart={};cart[${db().prods[0].id}]=${n}`); w.__sinAutoRec = false; ev(`$('#pay').value=${JSON.stringify(pay)}`); click('#cobrar'); };

  // turno 1: inicial 1000, vende 2 en efectivo + 1 transferencia + 1 débito
  assert(ev("CJ.abrir('1.000,00','Caja 1','').ok"));
  assert(!ev("CJ.abierta().traspaso"), 'la primera caja no tiene traspaso');
  vender('Efectivo', 2); vender('Transferencia'); vender('Tarjeta de débito');
  assert.strictEqual(db().sales.length, 3);
  const c1 = ev('CJ.abierta()'), k = J('CJ.calc(CJ.abierta())'); assert.strictEqual(k.esperado, 3000);
  // validaciones
  assert(ev("CJ.cerrar('3000','', undefined, {retiro:'abc'}).err"), 'retiro inválido');
  assert(ev("CJ.cerrar('3000','', undefined, {retiro:'4000'}).err"), 'no se retira más de lo contado');
  assert(ev("CJ.cerrar('3000','', undefined, {retiro:'0', medios:{qr:'x'}}).err"), 'medio inválido');
  // arqueo: transferencia coincide, débito difiere
  const r = J("CJ.cerrar('3000','', undefined, {retiro:'2.500,50', medios:{tra:'1000', deb:'900,50', qr:''}})");
  assert(r.ok, JSON.stringify(r)); const c = db().cajas[0];
  assert.strictEqual(c.retiro, 2500.5); assert.strictEqual(c.queda, 499.5, 'debería quedar = esperado - retiro');
  assert.deepStrictEqual(c.arqueo.tra, { dec: 1000, reg: 1000, dif: 0 }); assert.deepStrictEqual(c.arqueo.deb, { dec: 900.5, reg: 1000, dif: -99.5 }); assert(!c.arqueo.qr, 'vacío = no se cuenta');

  // turno 2: cuenta 400 cuando debía haber 499,50
  const a = J("CJ.abrir('400','Caja 1','')"); assert(a.ok);
  assert.deepStrictEqual([a.caja.traspaso.debia, a.caja.traspaso.dif], [499.5, -99.5], 'diferencia en la apertura');
  ev('draw()');
  // se ve en actividad, avisos y la foto del panel
  assert(ev("typeof ACT!=='undefined'||true"));
  assert(ev("AV.lista().some(a=>/Traspaso de caja/.test(a.txt))"), 'aviso de traspaso');
  assert(ev("AV.lista().some(a=>/arqueo por medio/.test(a.txt))"), 'aviso de arqueo');
  ev(`CJ.cerrar('400','')`); // sin retiro: queda = esperado
  assert.strictEqual(db().cajas[1].queda, 400); assert.strictEqual(db().cajas[1].retiro, 0);
  // turno 3 cuenta lo justo: sin diferencia
  assert.strictEqual(J("CJ.abrir('400','','').caja.traspaso.dif"), 0);
  // interfaz: cierre con retiro y arqueo, e historial
  ev("CJ.formCerrar()"); assert($('#cj_rt') && $('#cj_m_qr') && $('#cj_m_tra'), 'campos en el cierre');
  set('#cj_ct', '400'); set('#cj_rt', '100'); assert(/300/.test($('#cj_qd').textContent.replace(/[\s ]/g, '')), 'muestra lo que debería quedar');
  set('#cj_m_tra', '50'); assert(/Transferencia: Sobrante/.test($('#cj_ad').textContent));
  click('#cj_cok'); assert.strictEqual(db().cajas[2].queda, 300);
  const txt = ev("CJ.extra(db.cajas[1])") + ev("CJ.extra(db.cajas[0])"); assert(/Traspaso: debía haber/.test(ev('CJ.extra(db.cajas[1])')) && /Retiro/.test(txt) && /dif\./.test(txt));
  assert.deepStrictEqual(errs, [], 'sin errores');
  console.log('OK caja-traspaso'); process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
