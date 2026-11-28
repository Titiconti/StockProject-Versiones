// v5.7.3: el selector de componentes de una promo ofrece todos los productos vendibles (con buscador y por categoría).
const assert = require('assert'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, db, errs, d } = web();
  const ev = w.eval.bind(w), P = n => db().prods.find(p => p.name === n), qty = n => P(n).lots.reduce((a, l) => a + l.qty, 0);
  ev(`db.prods.length=0;db.sales.length=0;
    const mk=(n,cat,extra,q)=>{const x={id:db.nid++,name:n,code:'',price:100,cost:50,min:0,cat,lots:[],...extra};db.prods.push(x);if(q)addLot(x,'L',q,'');return x};
    mk('Café','Bebidas',{},20);mk('Medialuna','Panadería',{},30);mk('Churro','Panadería',{},30);mk('Coca','Bebidas',{},10);
    mk('Helado a granel','Helados',{unidad:'kg'},5000);mk('Harina','Insumos',{unidad:'kg'},10000);
    const pa=mk('Alfajor','Dulces',{control:'variantes'});mk('Alfajor',"Dulces",{padre:pa.id,attrs:{Sabor:'Chocolate'}},12);
    mk('Notebook','Tecno',{control:'serie'},0);mk('Gusto frutilla','Helados',{unidad:'kg',balde:1},1000);mk('Cucurucho','Helados',{tipo:'tamano'},0);
    draw()`);
  ev(`document.querySelector('#prm').open=true;PRM.filas()`);
  const opts = () => [...d.querySelectorAll('#prm_c select:first-of-type option')].map(o => o.textContent);
  const o = opts();
  for (const n of ['Café', 'Medialuna', 'Churro', 'Coca', 'Helado a granel', 'Harina']) assert(o.some(t => t.startsWith(n)), 'ofrece ' + n);
  assert(o.some(t => /Alfajor.*Chocolate/.test(t)), 'ofrece la variante');
  for (const n of ['Notebook', 'Gusto frutilla', 'Cucurucho']) assert(!o.some(t => t.startsWith(n)), 'no ofrece ' + n);
  assert(d.querySelectorAll('#prm_c select:first-of-type optgroup').length >= 4, 'agrupado por categoría');
  // buscador
  set('#prm_c [data-pq]', 'medi'); assert.deepStrictEqual(opts().filter(t => !/Elegí/.test(t)), ['Medialuna'], 'el buscador filtra');
  // armar la promo con un producto por kg (cantidad en kg con coma) y uno por unidad
  set('#prm_c [data-pq]', ''); const sel = d.querySelector('#prm_c select'); sel.value = String(P('Café').id); sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  click('#prm_a'); const s2 = d.querySelectorAll('#prm_c select')[1]; s2.value = String(P('Helado a granel').id); s2.dispatchEvent(new w.Event('change', { bubbles: true }));
  d.querySelectorAll('#prm_c [data-qty]')[1].value = '0,25';
  set('#prm_n', 'Café + bocha'); set('#prm_p', '3000'); click('#prm_g');
  const promo = P('Café + bocha'); assert(promo, 'se guardó'); assert.deepStrictEqual(promo.comp.map(c => c.q).sort((a, b) => a - b), [1, 250], '0,25 kg = 250 g');
  assert.strictEqual(ev(`avail(db.prods.find(p=>p.name==='Café + bocha'))`), 20);
  ev(`cart={};cart[${promo.id}]=2;$('#pay').value='Transferencia'`); w.__sinAutoRec = true; click('#cobrar');
  assert.strictEqual(qty('Café'), 18); assert.strictEqual(qty('Helado a granel'), 4500, '2 promos = 500 g');
  assert.deepStrictEqual(errs, []); console.log('OK promos-componentes'); process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
