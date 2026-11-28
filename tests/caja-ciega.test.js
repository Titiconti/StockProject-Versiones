// Caja "ciega": el empleado nunca ve el efectivo esperado ni la diferencia; el dueño (caja.ver) sí. Retiros separados del cierre y correcciones con historial.
const assert = require('assert'), { web } = require('./helpers'), validar = require('../validar'), autorizar = require('../permisos-datos');
(async () => {
  const { w, $, click, set, tab, txt, db, errs } = web();
  const ev = w.eval.bind(w), J = c => JSON.parse(ev('JSON.stringify(' + c + ')'));
  const EMP = "AU.habilitado=true;AU.usuario={id:2,nombre:'Eli'};AU.permisos={ventas:['ver','crear'],caja:['crear'],reporte:['ver']}";
  const DUE = "AU.habilitado=true;AU.usuario={id:1,nombre:'Dueña'};AU.permisos={ventas:['ver','crear'],caja:['ver','editar'],reporte:['ver'],configuracion:['ver','editar']}";
  ev(`db.prods.length=0;db.sales.length=0;db.cajas=[];const x={id:db.nid++,name:'Pan',code:'',price:1000,cost:0,min:0,lots:[]};db.prods.push(x);addLot(x,'L',500,'');draw()`);
  const vender = (pay, n = 1) => { ev(`cart={};cart[${db().prods[0].id}]=${n}`); w.__sinAutoRec = false; ev(`$('#pay').value=${JSON.stringify(pay)}`); click('#cobrar'); };
  const verTodo = () => { ev('draw()'); tab('v'); const a = txt('#cjbar'); ev("$('#masmenu button[data-t=\"k\"]').click()"); return [a, txt('#k'), JSON.stringify(ev('AV.lista()')), ev('AC.lista?JSON.stringify(AC.lista()):""'), txt('#pn_ca') || ''].join(' | '); };

  // ---- Turno 1 (empleada): retira a mitad de turno SIN cerrar, vende, y cierra con faltante sin retirar al cerrar ----
  ev(EMP);
  assert(ev("CJ.abrir('1234','Caja 1','').ok"));
  ev("AU.permisos={ventas:['ver','crear']}"); assert(ev("CJ.mov('egreso',1,'x','retiro').err"), 'sin caja.crear no hay retiros'); ev(EMP);
  vender('Efectivo', 2); vender('Tarjeta de débito');
  assert(ev("CJ.mov('egreso',300,'Retiro a la caja fuerte','retiro').ok"), 'retiro sin cerrar');
  assert(!ev('!!CJ.abierta().cierre') && ev('!!CJ.abierta()'), 'la caja sigue abierta tras el retiro');
  assert.strictEqual(db().cajas[0].movs[0].tipo, 'retiro'); assert(db().cajas[0].movs[0].user && db().cajas[0].movs[0].date);
  assert(ev("CJ.mov('egreso',50,'Bolsas','gasto').ok") && ev("CJ.mov('egreso',20,'Devolución yerba','devolucion').ok") && ev("CJ.mov('ingreso',10,'Cambio','ingreso').ok"));
  assert(ev("CJ.mov('egreso',5,'x','ingreso').err"), 'el tipo tiene que coincidir con el sentido');
  // esperado interno = 1234 + 2000 - 300 - 50 - 20 + 10 = 2874 ; vendido = 3000
  assert.strictEqual(J('CJ.calc(CJ.abierta())').esperado, 2874);
  const SECRETOS = ['2.874', '3.000', 'esperado', 'Esperado', 'Faltante', 'Sobrante', 'diferencia', 'Diferencia'];
  const limpio = (t, donde) => SECRETOS.forEach(s => assert(!t.includes(s), `${donde} deja ver "${s}": ${t.slice(0, 300)}`));
  tab('v'); limpio(txt('#cjbar'), 'barra de caja');
  assert($('#cj_rs'), 'hay botón de resumen del turno'); click('#cj_rs');
  const rs = txt('#cjov'); limpio(rs, 'resumen del turno');
  assert(/Ventas ?2/.test(rs) && /Pan/.test(rs) && /Retiro a la caja fuerte/.test(rs), 'el resumen trae cantidades, productos y sus retiros: ' + rs); click('[data-cjx]');
  // cierre ciego
  click('#cj_ce'); const cf = txt('#cjov'); limpio(cf, 'formulario de cierre'); assert(!$('#cj_df') || !$('#cj_df').textContent, 'sin diferencia en vivo');
  assert(!/registrado/i.test(cf), 'los medios no muestran lo registrado');
  set('#cj_ct', '2800'); click('#cj_cok');   // faltante de 74 y sin observación: igual cierra
  let c = db().cajas[0]; assert(c.cierre, 'nunca se bloquea por faltante'); assert.strictEqual(c.contado, 2800); assert.strictEqual(c.dif, -74); assert.strictEqual(c.tot.esperado, 2874);
  assert.strictEqual(c.retiro, 0, 'cerrar sin retirar'); assert(/Cierre registrado/.test($('#toast').textContent)); limpio($('#toast').textContent, 'mensaje de cierre');
  // ---- Turno 2 (misma empleada): abre contando distinto a lo que quedó; sobrante al cerrar, con retiro al cerrar ----
  assert(ev("CJ.abrir('2000','Caja 1','').ok")); assert(J('CJ.abierta().traspaso').dif !== 0, 'traspaso con diferencia guardado');
  vender('Efectivo', 1);
  click('#cj_ce'); set('#cj_ct', '3100'); set('#cj_rt', '1000'); click('#cj_cok');   // esperado 3000 -> sobrante 100
  c = db().cajas[1]; assert.strictEqual(c.dif, 100); assert.strictEqual(c.retiro, 1000); assert.strictEqual(c.queda, 2000, 'esperado interno de lo que queda'); assert.strictEqual(c.quedaDecl, 2100, 'lo que declaró que queda');
  ev('CJ.formAbrir()'); set('#cj_ini', '2300'); click('#cj_aok');   // cuenta 2300 y debía haber 2000: la empleada no se entera
  assert(db().cajas[2] && /^Caja abierta/.test($('#toast').textContent), 'la apertura es neutra'); limpio($('#toast').textContent, 'aviso de apertura');
  ev("CJ.cerrar('2100')");
  // ---- Lo que ve la empleada en TODAS las pantallas ----
  const todo = verTodo(); limpio(todo, 'pantallas de la empleada'); ['2.874', '3.100', '-74', '74', '2.000'].forEach(s => assert(!todo.includes('Faltante ' + s)));
  const hist = txt('#k'); assert(!/Esperado/.test(hist) && !/Diferencia/.test(hist) && /Cierre registrado/.test(hist), 'historial neutro: ' + hist.slice(0, 200));
  ev("AV.lista().forEach(a=>{if(/caja/i.test(a.txt)&&/faltante|sobrante|debía|diferencia/i.test(a.txt))throw new Error('aviso: '+a.txt)})");
  // ---- El dueño sí lo ve ----
  ev(DUE); ev('draw()'); ev("$('#masmenu button[data-t=\"k\"]').click()");
  const dh = txt('#k'); assert(/Esperado/.test(dh) && /Diferencia/.test(dh) && dh.includes('2.874') && /Faltante/.test(dh) && /Sobrante/.test(dh), 'el dueño ve esperado y diferencia: ' + dh.slice(0, 300));
  assert(/Traspaso/.test(dh), 'y el traspaso');
  assert(ev("AV.lista().some(a=>/faltante/.test(a.txt))"), 'aviso al dueño');
  assert(ev("(typeof AC!=='undefined'?JSON.stringify(AC.lista()):'').includes('faltante')"), 'actividad al dueño');
  // ---- Corrección: empleada no puede; el dueño solo con motivo y queda historial ----
  ev(EMP); assert(ev("CJ.corregir(db.cajas[0].id,{contado:'2874'},'Recuento').err"), 'empleado no corrige');
  ev(DUE); assert(ev("CJ.corregir(db.cajas[0].id,{contado:'2874'},'').err"), 'motivo obligatorio');
  assert(ev("CJ.corregir(db.cajas[0].id,{contado:'2874'},'Recuento con el dueño').ok"));
  c = db().cajas[0]; assert.strictEqual(c.contado, 2874); assert.strictEqual(c.dif, 0); assert.strictEqual(c.correcciones.length, 1);
  const cr = c.correcciones[0]; assert.strictEqual(cr.antes.contado, 2800); assert.strictEqual(cr.antes.dif, -74); assert.strictEqual(cr.despues.contado, 2874); assert.strictEqual(cr.motivo, 'Recuento con el dueño'); assert(cr.user && cr.date);
  assert.strictEqual(db().cajas.length, 3, 'no se borra nada');
  ev("$('#masmenu button[data-t=\"k\"]').click()"); assert(/Recuento con el dueño/.test(txt('#kh_l')) && /Corregir/.test(txt('#kh_l')));
  // ---- Validación al guardar: solo una corrección con permiso modifica un cierre ----
  const antes = db(), despues = JSON.parse(JSON.stringify(antes)); const base = JSON.parse(JSON.stringify(antes)); base.cajas[0].contado = 2800; base.cajas[0].dif = -74; delete base.cajas[0].correcciones;
  assert.strictEqual(validar(base, despues), null, 'una corrección registrada se acepta');
  const trucho = JSON.parse(JSON.stringify(despues)); delete trucho.cajas[0].correcciones; assert(validar(despues, trucho), 'sacar el historial no se acepta');
  const sinMotivo = JSON.parse(JSON.stringify(despues)); sinMotivo.cajas[0].correcciones[0].motivo = ''; assert(validar(base, sinMotivo), 'sin motivo no se acepta');
  const otroCampo = JSON.parse(JSON.stringify(despues)); otroCampo.cajas[0].tot.esperado = 1; assert(validar(base, otroCampo), 'no se toca el esperado');
  const abierta = { id: 500, uid: 2, user: 'Eli', caja: 'X', abre: '2026-01-01T10:00:00.000Z', ini: 1, movs: [] };
  const sinRetiro = JSON.parse(JSON.stringify(despues)); sinRetiro.cajas.push(abierta);
  const conRetiro = JSON.parse(JSON.stringify(sinRetiro)); conRetiro.cajas[conRetiro.cajas.length - 1].movs.push({ t: 'egreso', tipo: 'retiro', monto: 1, motivo: 'x', date: 'd', user: 'u' });
  const tiene = p => (m, a) => (p[m] || []).includes(a);
  assert(autorizar(sinRetiro, conRetiro, tiene({ ventas: ['crear'] })), 'un retiro sin caja.crear no se guarda');
  assert.strictEqual(autorizar(sinRetiro, conRetiro, tiene({ ventas: ['crear'], caja: ['crear'] })), null);
  assert.strictEqual(autorizar(base, despues, tiene({ ventas: ['crear'], caja: ['editar'] })), null);
  assert(autorizar(base, despues, tiene({ ventas: ['crear'] })), 'el empleado no puede guardar una corrección');
  // ---- Cajas con el formato viejo siguen viéndose ----
  ev(`db.cajas.push({id:99,uid:2,user:'Eli',caja:'Vieja',abre:'2026-01-02T10:00:00.000Z',ini:100,nota:'',movs:[{t:'egreso',monto:30,motivo:'Hielo',date:'2026-01-02T11:00:00.000Z',user:'Eli',cat:'Otros'}],cierre:'2026-01-02T20:00:00.000Z',contado:500,dif:20,notaCierre:'ok',tot:{esperado:480,vendido:900,porMedio:{Efectivo:410},ventas:3},cerro:'Eli',retiro:100,queda:380})`);
  ev(DUE); ev("$('#masmenu button[data-t=\"k\"]').click();CJ.drawHist()"); assert(/Vieja/.test(txt('#kh_l')) && /480/.test(txt('#kh_l')), 'el dueño ve la vieja completa');
  ev(EMP); ev("CJ.drawHist()"); assert(/Vieja/.test(txt('#kh_l')) && !/480/.test(txt('#kh_l')) && !/380/.test(txt('#kh_l')), 'la empleada ve la vieja sin esperado');
  // Resumen financiero: "Efectivo en caja" es esperado, así que solo lo ve quien tiene caja.ver
  ev(EMP); ev("CJ.abrir('50')"); ev("$('#w').classList.remove('hide')"); ev('PL.draw()'); assert(/Reservado/.test(txt('#pn_ca')) && !/50/.test(txt('#pn_ca')), 'la empleada no ve el efectivo en caja: ' + txt('#pn_ca'));
  ev(DUE); ev("CJ.abrir('70')"); ev('PL.draw()'); assert(/70/.test(txt('#pn_ca')), 'el dueño sí: ' + txt('#pn_ca'));
  assert.deepStrictEqual(errs, [], 'sin errores');
  console.log('OK caja-ciega'); process.exit(0);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
