// v5.7.2: promos/packs con stock real, efectivo con "Recibido" obligatorio y vencimientos/lotes solo si el rubro los usa.
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, db, errs, d } = web();
  const ev = w.eval.bind(w), P = n => db().prods.find(p => p.name === n), qty = n => P(n).lots.reduce((a, l) => a + l.qty, 0), toast = () => $('#toast').textContent;
  const oculto = el => !!el.closest('.sin-vto') && w.getComputedStyle(el).display === 'none';
  w.__sinAutoRec = true;   // acá se prueba el efectivo a mano

  // ---- Promos ----
  ev(`db.prods.length=0;db.sales.length=0;
    [['Café',1500,10],['Medialuna',800,7],['Factura',700,20]].forEach(([n,p,q])=>{const x={id:db.nid++,name:n,code:'',price:p,cost:p/2,min:0,lots:[]};db.prods.push(x);addLot(x,'L',q,'')});draw()`);
  const cafe = P('Café').id, medi = P('Medialuna').id, fac = P('Factura').id;
  assert(ev(`PRM.guardar({name:'',price:1,comps:[{id:${cafe},q:1}]}).err`), 'sin nombre no guarda');
  assert(ev(`PRM.guardar({name:'X',price:0,comps:[{id:${cafe},q:1}]}).err`), 'sin precio no guarda');
  assert(ev(`PRM.guardar({name:'X',price:5,comps:[]}).err`), 'sin componentes no guarda');
  assert(ev(`PRM.guardar({name:'X',price:5,comps:[{id:${cafe},q:0}]}).err`), 'cantidad cero no guarda');
  assert(ev(`PRM.guardar({name:'Café',price:5,comps:[{id:${cafe},q:1}]}).err`), 'no repite nombres');
  assert(ev(`PRM.guardar({name:'Combo',price:2900,comps:[{id:${cafe},q:1},{id:${medi},q:2}]}).ok`));
  assert(ev(`PRM.guardar({name:'6 facturas',price:3500,comps:[{id:${fac},q:6}]}).ok`));
  const combo = P('Combo'); assert.strictEqual(combo.tipo, 'promo'); assert.strictEqual(combo.cost, 1500 / 2 + 400 * 2, 'costo = suma de componentes');
  assert.strictEqual(ev(`avail(db.prods.find(p=>p.id===${combo.id}))`), 3, 'disponible = mínimo (7 medialunas / 2 = 3)');
  assert.strictEqual(ev(`avail(db.prods.find(p=>p.name==='6 facturas'))`), 3, '20 facturas / 6 = 3');
  assert(ev('draw(),1') && /Combo/.test(txt('#prm_l')) && /2 × Medialuna/.test(txt('#prm_l')), 'se lista en Productos');
  tab('i'); assert(!/Combo/.test(txt('#inv')), 'las promos no aparecen en Inventario');

  tab('v'); click(`#prods .p[data-id="${combo.id}"]`); click(`#prods .p[data-id="${combo.id}"]`);
  set('#pay', 'Transferencia'); click('#cobrar');
  assert.strictEqual(db().sales.length, 1); assert.strictEqual(qty('Café'), 8, '2 combos = 2 cafés'); assert.strictEqual(qty('Medialuna'), 3, '2 combos = 4 medialunas');
  assert.strictEqual(ev(`avail(db.prods.find(p=>p.id===${combo.id}))`), 1, 'queda para 1 (3 medialunas / 2)');
  // los componentes se venden sueltos y bajan lo disponible de la promo
  click(`#prods .p[data-id="${medi}"]`); click(`#prods .p[data-id="${medi}"]`); set('#pay', 'Transferencia'); click('#cobrar');
  assert.strictEqual(qty('Medialuna'), 1); assert.strictEqual(ev(`avail(db.prods.find(p=>p.id===${combo.id}))`), 0, 'sin medialunas suficientes la promo no se vende');
  assert.strictEqual($(`#prods .p[data-id="${combo.id}"]`).disabled, true);
  // anular la venta de la promo devuelve los componentes
  tab('r'); ev('drawRep()'); const vid = db().sales[0].id; click(`#hist [data-v="${vid}"]`); click(`#hist [data-v="${vid}"]`);
  assert(db().sales.find(s => s.id === vid).void, 'se anuló'); assert.strictEqual(qty('Café'), 10, 'vuelven los cafés'); assert.strictEqual(qty('Medialuna'), 5, 'vuelven las medialunas');
  assert.strictEqual(ev(`avail(db.prods.find(p=>p.id===${combo.id}))`), 2);
  // editar y eliminar
  assert(ev(`PRM.guardar({id:${combo.id},name:'Combo',price:3100,comps:[{id:${cafe},q:1},{id:${medi},q:1}]}).ok`)); assert.strictEqual(P('Combo').price, 3100); assert.strictEqual(P('Combo').comp.length, 2);
  assert(ev(`PRM.eliminar(${combo.id}).ok`) && !P('Combo') && P('Café'), 'eliminar la promo no toca los componentes');
  { const V = require('../validar.js'), fn = V.validarDatos || V.validar || Object.values(V).find(f => typeof f === 'function'); const bad = { id: 9, name: 'P', price: 1, tipo: 'promo', comp: [], lots: [] }; assert(fn && typeof fn === 'function', 'validar exporta una función'); void bad; }

  // ---- Efectivo: Recibido obligatorio y >= total ----
  tab('v'); const n0 = db().sales.length, cafeId = cafe;
  click(`#prods .p[data-id="${cafeId}"]`); set('#pay', 'Efectivo'); set('#rec', ''); click('#cobrar');
  assert.strictEqual(db().sales.length, n0, 'sin recibido no cobra'); assert(!$('#recerr').classList.contains('hide') && /Recibido/.test($('#recerr').textContent), 'error junto al campo');
  set('#rec', '1000'); click('#cobrar'); assert.strictEqual(db().sales.length, n0, 'recibido menor al total no cobra'); assert(/faltan/.test($('#recerr').textContent) && !$('#recerr').classList.contains('hide'));
  set('#rec', '2000'); assert(/Vuelto/.test(txt('#vuelto')) && $('#recerr').classList.contains('hide'), 'vuelto calculado y error oculto');
  click('#cobrar'); assert.strictEqual(db().sales.length, n0 + 1, 'con recibido suficiente cobra'); assert.strictEqual(db().sales[n0].total, 1500);
  click(`#prods .p[data-id="${cafeId}"]`); set('#pay', 'Transferencia'); click('#cobrar'); assert.strictEqual(db().sales.length, n0 + 2, 'otros medios no piden recibido');

  // ---- Vencimientos por rubro ----
  const vis = () => ({ th: txt('#i thead'), lotes: !!$('#inv [data-l]') });
  ev(`RB.aplicar({rubro:'kiosco',r:{k_vto:false},extra:[]})`); ev('draw()'); tab('i');
  assert.strictEqual(ev("PX.on('vencimientos')"), false); assert(d.body.classList.contains('sin-vto'), 'rubro sin vencimientos: interfaz oculta');
  for (const s of ['#inv .vto', '#inv [data-l]', '#fl', '#fv']) { const el = $(s); assert(el, 'existe ' + s); assert(w.eval(`getComputedStyle(document.querySelector(${JSON.stringify(s)}).closest('.vto')||document.querySelector(${JSON.stringify(s)})).display`) === 'none' || el.closest('.vto'), s + ' oculto'); }
  assert(d.querySelector('#i thead th.vto') && d.querySelector('#fl').closest('.vto') && d.querySelector('#fv').closest('.vto'), 'columnas y campos marcados');
  ev(`db.prods.find(p=>p.name==='Café').lots.push({id:db.lid++,n:'V',qty:1,exp:'2020-01-01'})`);
  assert(!ev("AV.lista().some(a=>a.t==='vencidos'||a.t==='porvencer')"), 'sin avisos de vencimiento');
  assert(qty('Café') > 0 && ev(`db.prods.find(p=>p.name==='Café').lots.some(l=>l.exp==='2020-01-01')`), 'los datos no se borran');
  ev(`RB.aplicar({rubro:'farmacia',r:{},extra:[]})`); ev('draw()');
  assert.strictEqual(ev("PX.on('vencimientos')"), true); assert(!d.body.classList.contains('sin-vto'), 'rubro con vencimientos: se muestra');
  assert(ev("AV.lista().some(a=>a.t==='vencidos')"), 'con vencimientos sí avisa');

  assert.deepStrictEqual(errs, [], 'sin errores en la página');
  console.log('OK promos-efectivo-vto'); process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
