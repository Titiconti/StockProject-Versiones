// v5.7: rubro heladería — gustos en baldes, tamaños con gramos repartidos, vendedor por venta, permiso de precios.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), { web } = require('./helpers');
(async () => {
  const { w, $, click, set, tab, txt, db, errs } = web();
  const ev = w.eval.bind(w), toast = () => $('#toast').textContent, P = n => db().prods.find(p => p.name === n);
  assert(ev("RB.aplicar({rubro:'heladeria',r:{},extra:[]}).ok"), 'el rubro heladería se aplica'); ev('draw()');
  assert(ev("PX.on('heladeria')") && ev("PX.on('peso')"));

  // ---- gustos: baldes, fracciones y ajuste manual ----
  assert(ev("HL.nuevoGusto('Chocolate','5','2').ok") && ev("HL.nuevoGusto('Frutilla','6','1').ok") && ev("HL.nuevoGusto('Limón','','0,5').ok"));
  assert.strictEqual(P('Chocolate').lots[0].qty, 10000, '2 baldes de 5 kg = 10.000 g');
  assert.strictEqual(P('Limón').balde, 5, 'balde lleno ≈ 5 kg por defecto'); assert.strictEqual(P('Limón').lots[0].qty, 2500);
  assert.deepStrictEqual([ev('HL.fmtB(0.5)'), ev('HL.fmtB(1)'), ev('HL.fmtB(1.5)'), ev('HL.fmtB(1.2)'), ev('HL.fmtB(0.1)')], ['0,5', '1', '1,5', '1', 'menos de 0,5'], 'stock visible en 0,5 / 1 / 1,5 baldes');
  assert(ev("HL.nuevoGusto('chocolate','5','1').err"), 'no repite nombres');
  assert.strictEqual(ev(`HL.cargar(${P('Limón').id},1).ok`), true); assert.strictEqual(P('Limón').lots.reduce((a, l) => a + l.qty, 0), 7500, '+1 balde');
  assert.strictEqual(ev(`HL.ajustar(${P('Frutilla').id},'0,5').ok`), true); assert.strictEqual(P('Frutilla').lots.reduce((a, l) => a + l.qty, 0), 3000, '"queda medio balde"');
  assert(ev(`HL.ajustar(${P('Frutilla').id},'abc').err`)); assert(db().ajustes.some(a => a.tipo === 'stock.ajuste'), 'el ajuste queda anotado');
  assert.strictEqual(ev(`HL.ajustar(${P('Frutilla').id},'1').ok`), true); assert.strictEqual(P('Frutilla').lots.reduce((a, l) => a + l.qty, 0), 6000);
  tab('v'); assert(!w.document.querySelector(`#prods .p[data-id="${P('Chocolate').id}"]`), 'un gusto sin precio por kg no se vende suelto');

  // ---- tamaños: ejemplos configurables y reparto exacto ----
  assert.strictEqual(ev('HL.ejemplos()'), 4); assert.strictEqual(ev('HL.ejemplos()'), 0, 'no pisa los existentes');
  assert.deepStrictEqual(db().prods.filter(p => p.tipo === 'armado').map(p => [p.name, p.receta.g, p.receta.gustos]), [['Cucurucho', 150, 2], ['1/4 kg', 250, 3], ['1/2 kg', 500, 4], ['1 kg', 1000, 4]]);
  assert.deepStrictEqual(JSON.parse(ev('JSON.stringify([HL.reparto(250,3),HL.reparto(150,2),HL.reparto(125,2),HL.reparto(500,4)])')), [[84, 83, 83], [75, 75], [63, 62], [125, 125, 125, 125]], 'gramos enteros: el resto va al primero');
  tab('v'); click(`#prods .p[data-id="${P('Cucurucho').id}"]`); assert(!$('#pxm') && /falta el precio/.test(toast()), 'sin precio no se vende');
  ev('document.querySelector("#masmenu button[data-t=hl]").click()'); assert(!$('#hl').classList.contains('hide'), 'pantalla Heladería');
  const tp = $(`#hl_tl [data-tp="${P('Cucurucho').id}"]`); tp.value = '3.000'; tp.dispatchEvent(new w.Event('change', { bubbles: true })); assert.strictEqual(P('Cucurucho').price, 3000);
  const tp4 = $(`#hl_tl [data-tp="${P('1/4 kg').id}"]`); tp4.value = '8000'; tp4.dispatchEvent(new w.Event('change', { bubbles: true }));
  const tg = $(`#hl_tl [data-tg="${P('Cucurucho').id}"]`); tg.value = '0'; tg.dispatchEvent(new w.Event('change', { bubbles: true })); assert(/gramos/.test(toast()) && P('Cucurucho').receta.g === 150, 'gramos inválidos no se guardan');

  // ---- vendedor en cada venta ----
  ev("HL.guardarVend('Ana, Luis, Ana')"); assert.deepStrictEqual(db().cfg.hel.vend.map(v => v.nombre), ['Ana', 'Luis']); tab('v');
  const bar = [...w.document.querySelectorAll('#hlbar [data-hv]')]; assert.strictEqual(bar.length, 2, 'botones con los empleados del turno');
  click(`#prods .p[data-id="${P('Cucurucho').id}"]`); assert($('#pxm'), 'pide los gustos');
  const g = n => `#hlg [data-hg="${P(n).id}"]`; click(g('Chocolate')); click(g('Frutilla')); click(g('Limón')); assert(/Máximo 2/.test(toast()), 'respeta el máximo de gustos');
  assert(/Chocolate 75 g/.test(txt('#hlgs')) && /Frutilla 75 g/.test(txt('#hlgs'))); click('#hlok'); assert(!$('#pxm')); assert(/Chocolate \+ Frutilla/.test(txt('#cart')));
  click('#cobrar'); assert(/quién vende/.test(toast()), 'sin vendedor no cobra'); assert.strictEqual(db().sales.length, 0);
  click(bar[0]); assert($('#hlbar [data-hv].on'), 'queda a la vista'); click('#cobrar');
  let s = db().sales[0]; assert.strictEqual(s.total, 3000); assert.deepStrictEqual(s.vend, { id: s.vend.id, nombre: 'Ana' }); assert.strictEqual(s.user, 'Ana'); assert.strictEqual(s.cajero, 'Sin usuario');
  assert.deepStrictEqual(s.items[0].gustos.map(x => [x.n, x.g]), [['Chocolate', 75], ['Frutilla', 75]]); assert.deepStrictEqual(s.items[0].sel, [[P('Chocolate').id, P('Frutilla').id]]);
  assert.strictEqual(P('Chocolate').lots.reduce((a, l) => a + l.qty, 0), 9925); assert.strictEqual(P('Frutilla').lots.reduce((a, l) => a + l.qty, 0), 5925);
  assert(/Ana/.test(txt('#hlbar [data-hv].on')), 'el último vendedor queda preseleccionado');
  // 1/4 kg con 3 gustos y otra persona vendiendo
  click(`#hlbar [data-hv="${db().cfg.hel.vend[1].id}"]`); click(`#prods .p[data-id="${P('1/4 kg').id}"]`); ['Chocolate', 'Frutilla', 'Limón'].forEach(n => click(g(n))); click('#hlok'); click('#cobrar');
  s = db().sales[1]; assert.strictEqual(s.vend.nombre, 'Luis'); assert.deepStrictEqual(s.items[0].gustos.map(x => x.g), [84, 83, 83]);
  assert.strictEqual(P('Chocolate').lots.reduce((a, l) => a + l.qty, 0), 9841);
  // sin stock suficiente en un gusto: no cobra y no descuenta
  ev(`db.prods.find(p=>p.name==='Limón').lots=[{id:9001,n:'x',qty:50,exp:''}]`); click(`#prods .p[data-id="${P('Cucurucho').id}"]`); click(g('Limón')); click('#hlok'); assert(/no alcanza/.test(toast()), 'avisa si un gusto no alcanza'); assert(!ev(`cartGus[${P('Cucurucho').id}]`)); click('#pxm [data-pxx]');
  // anular devuelve exactamente lo descontado
  tab('r'); const sid = db().sales[0].id; click(`#hist [data-v="${sid}"]`); click(`#hist [data-v="${sid}"]`); assert(db().sales[0].void);
  assert.strictEqual(P('Chocolate').lots.reduce((a, l) => a + l.qty, 0), 9916, 'vuelven los 75 g'); assert.strictEqual(P('Frutilla').lots.reduce((a, l) => a + l.qty, 0), 5917, 'solo vuelve lo de la venta anulada');

  // ---- reportes: ventas por vendedor ----
  const pv = JSON.parse(ev("JSON.stringify(HL.porVendedor(UT.hoy()))")); assert.deepStrictEqual(pv.map(o => [o.nombre, o.n, o.total]), [['Luis', 1, 8000]], 'la anulada no cuenta');
  tab('v'); ev('document.querySelector("#masmenu button[data-t=hl]").click()'); assert(/Luis/.test(txt('#hl_vl')) && !/Ana/.test(txt('#hl_vl')));

  // ---- permiso de precios: el empleado no los cambia (interfaz) ----
  ev("AU.habilitado=true;AU.usuario={id:2,rol:'empleado',user:'luis',nombre:'Luis'};AU.permisos={ventas:['ver','crear'],inventario:['ver'],productos:['ver','crear','editar']};draw()");
  assert.strictEqual(ev('HL.puedePrecios()'), false); ev('document.querySelector("#masmenu button[data-t=hl]").click()'); assert.strictEqual($('#hl_tl [data-tp]').disabled, true, 'precios bloqueados en la tabla de tamaños');
  tab('i'); click(`#inv [data-e="${P('Chocolate').id}"]`); assert.strictEqual($('#fp').disabled, true, 'el campo precio queda bloqueado'); $('#fp').disabled = false; set('#fp', '9999'); click('#fg');
  assert(/Solo el gerente/.test(toast()) && P('Chocolate').price === 0, 'ni siquiera forzando el campo');
  ev("AU.usuario.rol='gerente';draw()"); assert.strictEqual(ev('HL.puedePrecios()'), true);
  ev("AU.habilitado=false;draw()");

  // ---- usuarios.js (proceso principal): puedePrecios y cambiaPrecios ----
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-hel-')), us = require('../usuarios.js')({ usersFile: path.join(base, 'u.json'), auditFile: path.join(base, 'a.jsonl') });
  us.crear(null, { user: 'ana', nombre: 'Ana', rol: 'admin', clave: 'Clave1234' }); const ses = n => us.sesion(us.login(n, 'Clave1234').token), adm = ses('ana');
  ['luis:empleado', 'gero:gerente'].forEach(x => { const [u, r] = x.split(':'); assert(us.crear(adm, { user: u, rol: r, clave: 'Clave1234' }).ok); });
  assert(us.puedePrecios(adm) && us.puedePrecios(ses('gero')) && !us.puedePrecios(ses('luis')), 'admin y gerente sí; empleado no');
  const hel = (precio, extra = {}) => JSON.stringify({ cfg: { rubro: 'heladeria', ...extra }, prods: [{ id: 1, name: 'x', price: precio }, { id: 2, name: 'y', price: 5 }] });
  assert.strictEqual(us.cambiaPrecios(hel(100), hel(120)), true, 'cambio de precio en heladería');
  assert.strictEqual(us.cambiaPrecios(hel(100), hel(100)), false, 'sin cambios');
  assert.strictEqual(us.cambiaPrecios(hel(100), JSON.stringify({ cfg: { rubro: 'heladeria' }, prods: [{ id: 1, name: 'x', price: 100 }, { id: 2, name: 'y', price: 5 }, { id: 3, name: 'nuevo', price: 77 }] })), false, 'un producto nuevo no es un cambio de precio');
  assert.strictEqual(us.cambiaPrecios(JSON.stringify({ cfg: { rubro: 'kiosco' }, prods: [{ id: 1, price: 1 }] }), JSON.stringify({ cfg: { rubro: 'kiosco' }, prods: [{ id: 1, price: 2 }] })), false, 'en otros rubros no cambia nada');
  assert.strictEqual(us.cambiaPrecios(hel(100, { caps: { heladeria: true }, rubro: 'otro' }), hel(1, { caps: { heladeria: true }, rubro: 'otro' })), true, 'también por capacidad');
  assert.strictEqual(us.cambiaPrecios('no es json', hel(1)), false);

  // ---- lo guardado pasa la validación del proceso principal ----
  const validar = require('../validar'); assert.strictEqual(validar(null, db()), null);
  const mal = db(); mal.prods.find(p => p.tipo === 'armado').receta.g = 0; assert(validar(null, mal), 'tamaño inválido se rechaza');
  const mal2 = db(); mal2.prods.find(p => p.balde).balde = 500; assert(validar(null, mal2), 'balde inválido se rechaza');
  assert.deepStrictEqual(errs, []); console.log('HELADERIA_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
