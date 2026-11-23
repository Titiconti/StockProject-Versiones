// Catálogo precargado por rubro: archivos válidos, carga parcial por categoría, sin duplicados, sin precio no se vende y asistente.
const assert = require('assert'), fs = require('fs'), path = require('path'), { web, wait, until } = require('./helpers');
const DIR = path.join(__dirname, '..', 'catalogos'), norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
(async () => {
  const { w, $, $: q, click, set, db, errs, d } = web(), ev = w.eval.bind(w);
  const rubros = ev('Object.keys(RB.PERFILES).filter(k=>k!=="otro")');
  assert.strictEqual(rubros.length, 17);
  // 1) cada catálogo es válido, sin duplicados, sin precios ni códigos
  for (const r of rubros) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, r + '.json'), 'utf8'));
    assert.strictEqual(j.rubro, r); assert(j.productos.length >= 40 && j.productos.length <= 120, r + ': ' + j.productos.length + ' productos');
    const vistos = new Set();
    j.productos.forEach(p => { assert.deepStrictEqual(Object.keys(p).sort(), ['c', 'n', 'u'], r + ': solo nombre, categoría y unidad'); assert(p.n.trim() && p.c.trim() && ['u', 'kg'].includes(p.u), r + ' ' + p.n); assert(!vistos.has(norm(p.n)), r + ' repetido: ' + p.n); vistos.add(norm(p.n)); });
  }
  assert.strictEqual(ev('CT.limpiar({productos:[{n:"Pan",c:"A"},{n:"pán ",c:"A"},{n:"",c:"A"},{n:"x"},null]}).length'), 1, 'limpiar descarta repetidos y mal formados');
  // 2) el programa con el catálogo (se simula sp.catalogo leyendo los archivos reales)
  w.sp = { catalogo: async r => JSON.parse(fs.readFileSync(path.join(DIR, r + '.json'), 'utf8')) };
  ev('CT.hay=()=>true'); ev('db.prods=[];db.cfg.rubro="kiosco";db.cfg.caps=RB.resolver({rubro:"kiosco",r:{},extra:[]}).caps;draw()');
  const kiosco = JSON.parse(fs.readFileSync(path.join(DIR, 'kiosco.json'), 'utf8')).productos;
  const dela = c => kiosco.filter(p => p.c === c).length;
  ev('CT.abrir()'); assert(await until(() => q('#ct_box input[data-ct-cat]')), 'abre la vista previa');
  assert(/Golosinas/.test(q('#ct_box').textContent) && /Bebidas/.test(q('#ct_box').textContent), 'categorías visibles');
  click('#ct_box [data-ct-todo="0"]'); assert(q('#ct_ok').disabled, 'sin nada elegido no se carga');
  const chk = q('#ct_box input[data-ct-cat="Golosinas"]'); chk.checked = true; chk.dispatchEvent(new w.Event('change', { bubbles: true }));
  const ni = [...d.querySelectorAll('#ct_box input[data-ct-i]')]; click('#ct_box [data-ct-ver="Golosinas"]');
  const uno = q('#ct_box input[data-ct-i]'); uno.checked = false; uno.dispatchEvent(new w.Event('change', { bubbles: true }));   // destilda uno
  click('#ct_ok'); await wait(50);
  let P = db().prods; assert.strictEqual(P.length, dela('Golosinas') - 1, 'solo la categoría elegida menos uno');
  assert(P.every(p => p.price === 0 && p.cat === 'Golosinas' && !p.unidad && p.lots.length === 0), 'sin precio, sin stock');
  assert(q('#ctof'), 'ofrece poner precios'); click('#ctof_t');
  // 3) no duplica
  ev('CT.abrir()'); await until(() => q('#ct_box input[data-ct-cat]'));
  assert(/ya cargados/.test(q('#ct_box').textContent)); click('#ct_box [data-ct-todo="1"]'); click('#ct_ok'); await wait(50);
  P = db().prods; assert.strictEqual(P.length, kiosco.length, 'completó el resto sin repetir'); assert.strictEqual(new Set(P.map(p => norm(p.name))).size, P.length);
  assert.deepStrictEqual(JSON.parse(ev('JSON.stringify(CT.agregar(CT.limpiar({productos:[{n:"ALFAJOR   simple",c:"X"}]})))')), { n: 0, repetidos: 1 }, 'compara por nombre normalizado');
  click('#ctof_t');
  // 4) sin precio no se vende
  const p0 = db().prods[0]; ev(`addLot(db.prods[0],'L',5,'');draw()`);
  ev(`add(${p0.id})`); assert.strictEqual(ev('Object.keys(cart).length'), 0, 'no entra al carrito'); assert(/no tiene precio/.test(d.body.textContent));
  ev(`cart[${p0.id}]=1`); click('#cobrar'); assert(/no tiene precio/.test(d.body.textContent) && db().sales.length === 0 || ev('db.sales.length') === 0, 'cobrar lo rechaza');
  ev('cart={}'); assert(ev('sinPrecio(db.prods[0])') && !ev('sinPrecio({price:5})') && !ev('sinPrecio({price:0,tipo:"tamano"})'));
  // 5) grilla de precios
  ev('CT.precios()'); const pr0 = id => db().prods.find(x => x.id == id).price; const ins = [...d.querySelectorAll('#ctpr input[data-ctp]')]; assert(ins.length === kiosco.length);
  ins[0].value = '1.250,50'; ins[0].dispatchEvent(new w.Event('input')); ins[1].value = 'abc'; ins[1].dispatchEvent(new w.Event('input'));
  click('#ctp_ok'); assert.strictEqual(pr0(ins[0].dataset.ctp), 0, 'un precio inválido frena todo');
  ins[1].value = '300'; ins[1].dispatchEvent(new w.Event('input')); click('#ctp_ok');
  const pr = id => db().prods.find(x => x.id == id).price; assert.strictEqual(pr(ins[0].dataset.ctp), 1250.5); assert.strictEqual(pr(ins[1].dataset.ctp), 300); assert(!q('#ctpr'));
  ev(`addLot(db.prods.find(x=>x.id==${ins[0].dataset.ctp}),'L',5,'')`); ev(`add(${ins[0].dataset.ctp})`); assert.strictEqual(ev('Object.keys(cart).join()'), String(ins[0].dataset.ctp), 'con precio se vende');
  // 6) kg solo si el negocio vende por peso; vencimiento por defecto en farmacia
  ev('cart={}'); ev('db.prods=[];db.cfg.caps=RB.resolver({rubro:"verduleria",r:{},extra:[]}).caps');
  ev('CT.agregar([{n:"Papa",c:"V",u:"kg"}])'); assert.strictEqual(db().prods[0].unidad, 'kg');
  ev('db.prods=[];db.cfg.caps=RB.resolver({rubro:"kiosco",r:{},extra:[]}).caps'); ev('CT.agregar([{n:"Papa",c:"V",u:"kg"}])'); assert(!db().prods[0].unidad);
  ev('db.prods=[];db.cfg.caps=RB.resolver({rubro:"farmacia",r:{},extra:[]}).caps'); ev('CT.agregar([{n:"Ibuprofeno",c:"M"}])'); assert.strictEqual(db().prods[0].reqVto, true);
  // 7) permisos: sin permiso de crear no carga
  ev('db.prods=[]'); ev('AU.habilitado=true;AU.permisos={productos:["ver","editar"]}'); ev('CT.abrir()'); assert(!q('#ctov'), 'sin permiso no abre'); ev('AU.habilitado=false');
  // 8) asistente de primer uso
  ev('db.prods=[];delete db.cfg.rubro;delete db.cfg.caps;delete db.cfg.encuesta;CF.abrirEncuesta(true)');
  const r = q('#enc [name="tipo"][value="kiosco"]'); r.checked = true; r.dispatchEvent(new w.Event('change', { bubbles: true })); click('#e_sig');
  assert(/contanos cómo trabajás/.test(q('#enc').textContent)); click('#e_sig');
  assert(await until(() => q('#enc #ct_box input[data-ct-cat]')), 'paso del catálogo después del rubro'); assert(/productos de ejemplo/.test(q('#enc').textContent));
  click('#enc [data-ct-ver="Bebidas"]'); const cb = q('#enc input[data-ct-cat="Cigarrillos y tabaco"]'); cb.checked = false; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  click('#e_sig'); click('#e_sig'); click('#e_sig'); set('#e_nom', 'Negocio de prueba'); click('#e_sig');
  assert(!q('#enc'), 'termina'); P = db().prods; assert.strictEqual(P.length, kiosco.length - dela('Cigarrillos y tabaco'), 'cargó lo elegido');
  assert(P.every(p => p.price === 0) && !P.some(p => p.cat === 'Cigarrillos y tabaco'));
  assert(q('#ctof'), 'ofrece los precios al terminar'); click('#ctof_ok'); assert(q('#ctpr'), 'abre la grilla'); click('#ctp_x');
  assert.deepStrictEqual(errs, []); console.log('CATALOGO_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });







