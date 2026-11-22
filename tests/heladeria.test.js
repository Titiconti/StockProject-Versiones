// v5.7: rubro heladería — baldes aparte (con historial), tamaños de precio fijo, vendedor por venta, permiso de precios.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, db, errs } = web();
  const ev = w.eval.bind(w), toast = () => $('#toast').textContent, P = n => db().prods.find(p => p.name === n), tot0 = p => p.lots.reduce((a, l) => a + l.qty, 0), kg = n => P(n).lots.reduce((a, l) => a + l.qty, 0);
  const J = c => JSON.parse(ev('JSON.stringify(' + c + ')'));
  assert(ev("RB.aplicar({rubro:'heladeria',r:{},extra:[]}).ok"), 'el rubro heladería se aplica'); ev('draw()');
  assert(ev("PX.on('heladeria')") && ev("PX.on('peso')"));

  // ---- baldes: carga, fracciones, ajuste e historial ----
  assert(ev("HL.nuevoGusto('Chocolate','2').ok") && ev("HL.nuevoGusto('Frutilla','1').ok") && ev("HL.nuevoGusto('Limón','0,5').ok"));
  assert.strictEqual(kg('Chocolate'), 2000, '2 baldes = 2000 milésimas'); assert.strictEqual(P('Limón').balde, 1, 'la unidad es el balde'); assert.strictEqual(kg('Limón'), 500);
  assert.deepStrictEqual([ev('HL.fmtB(0.5)'), ev('HL.fmtB(1)'), ev('HL.fmtB(1.5)'), ev('HL.fmtB(1.2)'), ev('HL.fmtB(0.1)')], ['0,5', '1', '1,5', '1,25', 'menos de 0,25'], 'stock visible en 0,5 / 1 / 1,5 baldes');
  assert(ev("HL.nuevoGusto('chocolate','1').err"), 'no repite nombres');
  assert.strictEqual(ev(`HL.cargar(${P('Limón').id},1).ok`), true); assert.strictEqual(kg('Limón'), 1500, 'entró 1 balde');
  assert.strictEqual(ev(`HL.ajustar(${P('Frutilla').id},'0,5').ok`), true); assert.strictEqual(kg('Frutilla'), 500, '"queda medio balde"');
  assert(ev(`HL.ajustar(${P('Frutilla').id},'abc').err`)); assert(db().ajustes.some(a => a.tipo === 'stock.ajuste'));
  assert.strictEqual(ev(`HL.ajustar(${P('Frutilla').id},'1').ok`), true); assert.strictEqual(kg('Frutilla'), 1000);
  const hb = db().baldes; assert.deepStrictEqual(hb.map(h => [h.gusto, h.t, h.baldes]), [['Chocolate', 'ingreso', 2], ['Frutilla', 'ingreso', 1], ['Limón', 'ingreso', 0.5], ['Limón', 'ingreso', 1], ['Frutilla', 'ajuste', 0.5], ['Frutilla', 'ajuste', 1]], 'historial de baldes');
  assert(hb.every(h => h.user === 'Sin usuario' && h.date), 'queda quién y cuándo');
  ev('document.querySelector("#masmenu button[data-t=hl]").click()'); assert(/Entró 2 balde/.test(txt('#hl_hl')) && /Quedó en 0,5 balde/.test(txt('#hl_hl')) && /Chocolate/.test(txt('#hl_hl')), 'se ve el historial');
  ev(`HL.ajustar(${P('Limón').id},'0,5')`); ev('draw()'); assert(/Limón\s*Pedir/.test(txt('#hl_gl')), 'avisa qué pedir (menos de 1 balde)');
  tab('v'); assert(!w.document.querySelector(`#prods .p[data-id="${P('Chocolate').id}"]`), 'un gusto no se vende suelto');

  // ---- tamaños de precio fijo: productos comunes sin stock propio ----
  assert.strictEqual(ev('HL.ejemplos()'), 0, 'al elegir el rubro ya se cargaron los ejemplos'); assert.strictEqual(ev('HL.ejemplos()'), 0, 'no pisa los existentes');
  assert.deepStrictEqual(db().prods.filter(p => p.tipo === 'tamano').map(p => p.name), ['Cucurucho', '1/4 kg', '1/2 kg', '1 kg']); assert(!db().prods.some(p => p.receta), 'sin receta de gramos');
  // envases: productos comunes (unidades, stock 0) vinculados a cada tamaño
  assert.deepStrictEqual(db().prods.filter(p => p.cat === 'Envases').map(p => [p.name, tot0(p)]), [['Cucurucho (envase)', 0], ['Vaso térmico 1/4', 0], ['Vaso térmico 1/2', 0], ['Envase 1 kg', 0]]);
  assert.deepStrictEqual(['Cucurucho', '1/4 kg', '1/2 kg', '1 kg'].map(n => P(n).env), ['Cucurucho (envase)', 'Vaso térmico 1/4', 'Vaso térmico 1/2', 'Envase 1 kg'].map(n => P(n).id), 'cada tamaño con su envase');
  assert(/Paletas y otros/.test(ev("JSON.stringify(PX.rubro().cats)")), 'categoría Paletas y otros');
  tab('v'); assert.strictEqual($(`#prods .p[data-id="${P('1/4 kg').id}"]`).disabled, true, 'sin vasos no se vende'); assert(/Sin vaso térmico 1\/4/.test($(`#prods .p[data-id="${P('1/4 kg').id}"]`).textContent), 'avisa Sin vasos');
  assert(!w.document.querySelector(`#prods .p[data-id="${P('Vaso térmico 1/4').id}"]`), 'los envases sin precio no se ofrecen en Ventas');
  ev(`addLot(db.prods.find(p=>p.name==='Vaso térmico 1/4'),'L',3,'');addLot(db.prods.find(p=>p.name==='Cucurucho (envase)'),'L',10,'');draw()`);
  tab('v'); click(`#prods .p[data-id="${P('1/4 kg').id}"]`); click('#cobrar'); assert(/falta el precio/.test(toast()), 'sin precio no se vende');
  for (let i = 0; i < 4; i++) click(`#prods .p[data-id="${P('1/4 kg').id}"]`); assert(/No quedan vaso térmico 1\/4/.test(toast()), 'no deja agregar más tamaños que envases');
  click('#vaciar'); ev('document.querySelector("#masmenu button[data-t=hl]").click()');
  const tp = $(`#hl_tl [data-tp="${P('Cucurucho').id}"]`); tp.value = '3.000'; tp.dispatchEvent(new w.Event('change', { bubbles: true })); assert.strictEqual(P('Cucurucho').price, 3000);
  const tp4 = $(`#hl_tl [data-tp="${P('1/4 kg').id}"]`); tp4.value = '8000'; tp4.dispatchEvent(new w.Event('change', { bubbles: true })); assert.strictEqual(P('1/4 kg').price, 8000);
  tab('i'); assert(!w.document.querySelector(`#inv [data-e="${P('1/4 kg').id}"]`), 'los tamaños no figuran en Inventario');

  // ---- ventas por tamaño: user y caja del empleado, como en el resto del sistema ----
  ev("CJ.abrir(1000,'Caja 1','')"); tab('v'); assert(!w.document.querySelector('#hlbar'), 'sin selector de vendedor');
  click(`#prods .p[data-id="${P('1/4 kg').id}"]`); assert(!$('#pxm'), 'entra directo, sin elegir gustos'); click('#cobrar');
  let s = db().sales[0]; assert.strictEqual(tot0(P('Vaso térmico 1/4')), 2, 'vender 1/4 descuenta un vaso'); assert.strictEqual(s.total, 8000); assert.strictEqual(s.user, 'Sin usuario'); assert(!('vend' in s), 'no hay vendedor por venta');
  assert(!s.items[0].gustos && !s.items[0].sel, 'la venta no toca los gustos'); assert.strictEqual(kg('Chocolate'), 2000); assert.strictEqual(s.caja, db().cajas[0].id); assert.strictEqual(ev('CJ.calc(CJ.abierta()).vendido'), 8000, 'la caja cuenta la venta');
  click(`#prods .p[data-id="${P('Cucurucho').id}"]`); click(`#prods .p[data-id="${P('Cucurucho').id}"]`); click('#cobrar'); s = db().sales[1]; assert(s.total === 6000 && s.items[0].qty === 2); assert.strictEqual(tot0(P('Cucurucho (envase)')), 8, '2 cucuruchos = 2 envases');
  tab('r'); const sid = db().sales[0].id; click(`#hist [data-v="${sid}"]`); click(`#hist [data-v="${sid}"]`); assert(db().sales[0].void);
  assert.strictEqual(tot0(P('Vaso térmico 1/4')), 3, 'anular devuelve el vaso'); assert.strictEqual(tot0(P('Cucurucho (envase)')), 8);
  assert.strictEqual(ev('CJ.calc(CJ.abierta()).esperado'), 7000, 'esperado de caja: 1000 + 6000 (la anulada no cuenta)'); assert.strictEqual(db().cajas[0].user, 'Sin usuario');

  // ---- conteo de baldes dentro de Inventario (mismas funciones que Más > Heladería) ----
  tab('i'); assert(!$('#hl_inv').classList.contains('hide') && $('#i').classList.contains('hlg'), 'panel visible en Inventario');
  assert(/Limón\s*Pedir/.test(txt('#hl_ib')) && /Chocolate/.test(txt('#hl_ib')), 'gustos con marca Pedir');
  const l0 = kg('Limón'), h0 = db().baldes.length; click(`#hl_ib [data-hm="${P('Limón').id}"]`); assert.strictEqual(kg('Limón'), l0 + 1000, 'Entró balde desde Inventario'); assert.strictEqual(db().baldes.length, h0 + 1);
  const q = $(`#hl_ib [data-hq="${P('Limón').id}"]`); q.value = '0,5'; click(`#hl_ib [data-ha="${P('Limón').id}"]`); assert.strictEqual(kg('Limón'), 500, 'Ajustar desde Inventario'); assert.strictEqual(db().baldes.slice(-1)[0].t, 'ajuste');
  click('#hl_inv [data-hh]'); assert(!$('#hl').classList.contains('hide'), 'Historial lleva a la pantalla Heladería');
  ev("db.cfg.caps.heladeria=false;draw()"); tab('i'); assert($('#hl_inv').classList.contains('hide') && !$('#i').classList.contains('hlg'), 'otros rubros no ven el panel'); ev("db.cfg.caps.heladeria=true;draw()");
  // ---- sin kilos ni gramos y migración de datos 5.7.0 (balde = kg, stock en gramos) ----
  ev("db.prods.push({id:db.nid++,name:'Viejo',code:'',price:0,cost:0,min:0,unidad:'kg',balde:5,cat:'Helado',lots:[{id:db.lid++,n:'Baldes',qty:7500,exp:''}]});HL.migrar();draw()");
  assert.deepStrictEqual([P('Viejo').balde, kg('Viejo')], [1, 1500], '7,5 kg con balde de 5 kg = 1,5 baldes');
  ev('HL.migrar();HL.migrar()'); assert.strictEqual(kg('Viejo'), 1500, 'migrar dos veces no cambia nada'); assert.strictEqual(ev(`HL.baldes(db.prods.find(p=>p.name==='Viejo'))`), 1.5);
  tab('i'); assert(/Viejo\s*1,5 baldes/.test(txt('#hl_ib')), 'se ve 1,5 baldes'); assert(!/\bkg\b|\bg\b|gramos|kilo/i.test(txt('#hl_ib') + txt('#hl_gl') + txt('#hl_hl')), 'ni kilos ni gramos en los baldes');
  assert(/Viejo[\s\S]*1,5 baldes/.test(txt('#inv')) && !/Viejo[^\n]*\bkg\b/.test(txt('#inv')), 'Inventario muestra baldes, no kg');  click(`#inv [data-e="${P('Viejo').id}"]`); assert(/Balde/.test($('#px_u option[value=kg]').textContent) && !/kg/.test($('#px_u option[value=kg]').textContent + $('#fp').previousElementSibling.textContent + $('#fs').previousElementSibling.textContent), 'la ficha de un gusto no habla de kg'); tab('i');
  // ---- eliminar gustos y tamaños, vincular envases, heladerías ya configuradas sin envase ----
  ev("db.prods.push({id:db.nid++,name:'Sin vaso',code:'',price:500,cost:0,min:0,tipo:'tamano',cat:'Tamaños',lots:[]});draw()");
  tab('v'); assert.strictEqual($(`#prods .p[data-id="${P('Sin vaso').id}"]`).disabled, false, 'un tamaño sin envase vinculado se vende como antes');
  ev('document.querySelector("#masmenu button[data-t=hl]").click()');
  const chg = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  chg($(`#hl_tl [data-te="${P('Sin vaso').id}"]`), String(P('Vaso térmico 1/2').id)); assert.strictEqual(P('Sin vaso').env, P('Vaso térmico 1/2').id, 'se vincula desde Más > Heladería');
  chg($(`#hl_tl [data-te="${P('Sin vaso').id}"]`), ''); assert.strictEqual(P('Sin vaso').env, undefined, 'se desvincula');
  assert(ev(`HL.vincular(${P('Sin vaso').id},${P('Chocolate').id}).err`), 'un gusto no sirve de envase');
  ev("AU.habilitado=true;AU.usuario={id:9,rol:'empleado',user:'caja',nombre:'Caja'};AU.permisos={ventas:['ver','crear'],inventario:['ver'],productos:['ver','crear','editar']};draw()");
  assert.strictEqual($(`#hl_gl [data-hd="${P('Viejo').id}"]`).disabled, true, 'sin permiso de eliminar el botón queda deshabilitado'); $(`#hl_gl [data-hd="${P('Viejo').id}"]`).click(); assert(P('Viejo'));
  ev("AU.permisos.productos=['ver','crear','editar','eliminar'];draw()");
  const nHist = db().baldes.length, nVentas = db().sales.length, gid = P('Viejo').id;
  click(`#hl_gl [data-hd="${gid}"]`); assert(P('Viejo'), 'el primer toque solo pide confirmación'); assert(/¿Seguro\?/.test($(`#hl_gl [data-hd="${gid}"]`).textContent));
  click(`#hl_gl [data-hd="${gid}"]`); assert(!P('Viejo'), 'eliminar gusto'); assert.strictEqual(db().baldes.length, nHist, 'el historial de baldes queda'); assert.strictEqual(db().sales.length, nVentas);
  const vaso = P('Vaso térmico 1/2').id, tid = P('1/2 kg').id; assert(ev(`HL.eliminar(${vaso}).err`), 'solo gustos y tamaños'); assert.strictEqual(ev(`HL.eliminar(${P('Sin vaso').id}).ok`), true); assert(!P('Sin vaso'), 'eliminar tamaño');
  const t0 = db().sales.find(x => x.items[0].name === '1/4 kg'); assert(t0 && t0.void, 'las ventas viejas siguen');
  ev("db.prods=db.prods.filter(p=>p.name!=='Vaso térmico 1/2')"); assert.strictEqual(ev(`avail(db.prods.find(p=>p.id===${tid}))`), 9999, 'si falta el envase el tamaño queda sin vincular y se vende como antes');
  ev("AU.habilitado=false;draw()");
  const { proyeccion } = require('../nube'); const fn = JSON.parse(JSON.stringify(proyeccion(db(), Date.now()))).stock;
  assert.strictEqual(fn.find(x => x.n === 'Vaso térmico 1/4').envase, true, 'el celular sabe qué productos son envases'); assert(!fn.find(x => x.n === 'Chocolate').envase);
  // ---- precio de gustos en Inventario y eliminar un envase vinculado ----
  ev("db.prods.push({id:db.nid++,name:'Envase tmp',code:'',price:0,cost:0,min:0,cat:'Envases',lots:[{id:db.lid++,n:'L',qty:5,exp:''}]},{id:db.nid++,name:'Tam tmp',code:'',price:900,cost:0,min:0,tipo:'tamano',cat:'Tamaños',lots:[]});db.prods.find(p=>p.name==='Tam tmp').env=db.prods.find(p=>p.name==='Envase tmp').id;draw()");
  tab('i');
  const rowG = [...w.document.querySelectorAll('#inv tr')].find(r => /Chocolate/.test(r.textContent)); assert(/—/.test(rowG.children[3].textContent) && !/\$/.test(rowG.children[3].textContent), 'Precio de un gusto: —');
  const eb = `#inv [data-d="${P('Envase tmp').id}"]`; click(eb); assert(/Tam tmp usa este envase y va a quedar sin control de stock/.test(toast()), 'avisa antes de confirmar'); assert(P('Envase tmp'));
  click(eb); assert(!P('Envase tmp'), 'se elimina el envase'); assert.strictEqual(P('Tam tmp').env, undefined, 'el tamaño queda sin vincular');
  ev('document.querySelector("#masmenu button[data-t=hl]").click()'); assert(/Tam tmp\s*Sin envase vinculado/.test(txt('#hl_tl')), 'se ve Sin envase vinculado'); assert($(`#hl_tl [data-te="${P('Tam tmp').id}"]`).options[0].textContent.includes('Elegí un envase'), 'con acceso para vincular otro');
  chg($(`#hl_tl [data-te="${P('Tam tmp').id}"]`), String(P('Vaso térmico 1/4').id)); assert.strictEqual(P('Tam tmp').env, P('Vaso térmico 1/4').id, 'se vincula otro'); assert(!/Tam tmp\s*Sin envase/.test(txt('#hl_tl')));
  ev(`HL.eliminar(${P('Tam tmp').id})`);
  // ---- permiso de precios ----
  ev("AU.habilitado=true;AU.usuario={id:2,rol:'empleado',user:'luis',nombre:'Luis'};AU.permisos={ventas:['ver','crear'],inventario:['ver'],productos:['ver','crear','editar']};draw()");
  assert.strictEqual(ev('HL.puedePrecios()'), false); ev('document.querySelector("#masmenu button[data-t=hl]").click()'); assert.strictEqual($('#hl_tl [data-tp]').disabled, true, 'precios bloqueados en la tabla de tamaños');
  tab('i'); click(`#inv [data-e="${P('Chocolate').id}"]`); assert.strictEqual($('#fp').disabled, true, 'el campo precio queda bloqueado'); $('#fp').disabled = false; set('#fp', '9999'); click('#fg');
  assert(/Solo el gerente/.test(toast()) && P('Chocolate').price === 0, 'ni siquiera forzando el campo');
  ev("AU.usuario.rol='gerente';draw()"); assert.strictEqual(ev('HL.puedePrecios()'), true); ev("AU.habilitado=false;draw()");

  // ---- usuarios.js (proceso principal) ----
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-hel-')), us = require('../usuarios.js')({ usersFile: path.join(base, 'u.json'), auditFile: path.join(base, 'a.jsonl') });
  us.crear(null, { user: 'ana', nombre: 'Ana', rol: 'admin', clave: 'Clave1234' }); const ses = n => us.sesion(us.login(n, 'Clave1234').token), adm = ses('ana');
  ['luis:empleado', 'gero:gerente'].forEach(x => { const [u, r] = x.split(':'); assert(us.crear(adm, { user: u, rol: r, clave: 'Clave1234' }).ok); });
  assert(us.puedePrecios(adm) && us.puedePrecios(ses('gero')) && !us.puedePrecios(ses('luis')), 'admin y gerente sí; empleado no');
  const hel = (precio, extra = {}) => JSON.stringify({ cfg: { rubro: 'heladeria', ...extra }, prods: [{ id: 1, name: 'x', price: precio }, { id: 2, name: 'y', price: 5 }] });
  assert.strictEqual(us.cambiaPrecios(hel(100), hel(120)), true, 'cambio de precio en heladería'); assert.strictEqual(us.cambiaPrecios(hel(100), hel(100)), false);
  assert.strictEqual(us.cambiaPrecios(hel(100), JSON.stringify({ cfg: { rubro: 'heladeria' }, prods: [{ id: 1, name: 'x', price: 100 }, { id: 2, name: 'y', price: 5 }, { id: 3, name: 'nuevo', price: 77 }] })), false, 'un producto nuevo no es un cambio de precio');
  assert.strictEqual(us.cambiaPrecios(JSON.stringify({ cfg: { rubro: 'kiosco' }, prods: [{ id: 1, price: 1 }] }), JSON.stringify({ cfg: { rubro: 'kiosco' }, prods: [{ id: 1, price: 2 }] })), false, 'en otros rubros no cambia nada');
  assert.strictEqual(us.cambiaPrecios(hel(100, { caps: { heladeria: true }, rubro: 'otro' }), hel(1, { caps: { heladeria: true }, rubro: 'otro' })), true, 'también por capacidad'); assert.strictEqual(us.cambiaPrecios('no es json', hel(1)), false);

  // ---- lo guardado pasa la validación del proceso principal ----
  const validar = require('../validar'); assert.strictEqual(validar(null, db()), null);
  const mal = db(); mal.prods.find(p => p.balde).balde = 500; assert(validar(null, mal), 'balde inválido se rechaza');
  const mal2 = db(); mal2.prods.find(p => p.tipo).tipo = 'otro'; assert(validar(null, mal2), 'tipo inválido se rechaza');
  assert.deepStrictEqual(errs, []); console.log('HELADERIA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });