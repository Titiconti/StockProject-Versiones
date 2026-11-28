// v5.8: Horarios — grilla de turnos y francos (también de noche), solo lectura para empleados, copiar semana, historial y WhatsApp.
const assert = require('assert'), { web } = require('./helpers'), autorizar = require('../permisos-datos'), U = require('../usuarios'), validar = require('../validar');
(async () => {
  const { w, $, click, db, errs } = web();
  const ev = w.eval.bind(w), J = c => JSON.parse(ev('JSON.stringify(' + c + ')'));
  const LUN = '2026-11-30', D = i => ev(`HR.mas('${LUN}',${i})`), D9 = ['09:00', '17:00'];
  const H = () => J('db.horarios'), cel = (e, f) => (H().plan[e] || {})[f];
  const emp = (n, uid) => ev(`HR.agregar('${n}',${uid == null ? 'null' : uid}),HR.d().emp.find(e=>e.nombre==='${n}').id`);
  const poner = (e, i, d) => ev(`HR.poner(${e},'${D(i)}',${JSON.stringify(d)})`);

  // ---- fechas y turnos que cruzan la medianoche ----
  assert.strictEqual(ev(`HR.lunes('2026-12-06')`), LUN, 'la semana empieza el lunes'); assert.strictEqual(ev(`HR.dia('2026-12-01')`), 'Mar 1/12');
  const ana = emp('Ana', 7), caro = emp('Caro'), beto = emp('Beto');
  assert(poner(caro, 0, { t: [['22:00', '06:00']] }).ok); assert.deepStrictEqual(J(`HR.iv(['22:00','06:00'])`), [1320, 1800], 'el turno 22-06 termina al día siguiente');
  assert.strictEqual(ev(`HR.celTxt(HR.d().plan[${caro}]['${D(0)}'])`), '22:00–06:00 (+1)'); assert.strictEqual(ev(`HR.celTxt({t:[['09:00','17:00']]})`), '09:00–17:00');
  // empleados con turnos distintos, turno cortado, franco, nota excepcional y errores
  assert(poner(ana, 0, { t: [['09:00', '13:00'], ['17:00', '21:00']] }).ok && cel(ana, D(0)).t.length === 2, 'turno cortado');
  assert(poner(ana, 1, { f: 1 }).ok); assert.deepStrictEqual(cel(ana, D(1)), { f: 1 }); assert(poner(beto, 0, { t: [D9], nota: 'cambio puntual' }).ok); assert.strictEqual(cel(beto, D(0)).nota, 'cambio puntual');
  assert(poner(beto, 3, { t: [['9:00', '17:00']] }).ok && cel(beto, D(3)).t[0][0] === '09:00', 'normaliza la hora');
  assert(poner(caro, 3, { t: [['09:00', '09:00']] }).err && poner(caro, 3, { t: [['9', 'x']] }).err && poner(caro, 3, { t: [['09:00', '13:00'], ['12:00', '18:00']] }).err, 'horarios inválidos o que se pisan');
  assert(ev(`HR.poner(999,'${D(0)}',{f:1}).err`), 'empleado inexistente');
  assert(poner(beto, 3, { t: [] }).ok && !cel(beto, D(3)), 'dejar sin horario');
  // historial: quién, qué, cuándo, canal
  assert(H().hist.some(h => /Caro, Lun 30\/11: sin horario → 22:00–06:00 \(\+1\)/.test(h.txt) && h.canal === 'programa' && h.quien === 'Sin usuario' && h.t), 'queda en el historial');

  // ---- copiar semana ----
  assert(ev(`HR.copiar('${LUN}').ok`)); assert.deepStrictEqual(cel(caro, D(7)), { t: [['22:00', '06:00']] }); assert.deepStrictEqual(cel(ana, D(8)), { f: 1 }); assert(!cel(beto, D(7)).nota, 'la nota excepcional no se copia');
  assert(ev(`HR.copiar('${LUN}').existe`), 'avisa si la siguiente ya tiene datos'); assert(ev(`HR.copiar('${LUN}',true).ok`)); assert(ev(`HR.copiar('${D(21)}').err`), 'semana vacía no se copia');

  // ---- WhatsApp: texto e imagen ----
  const tx = ev(`HR.texto('${LUN}')`); assert(/\*Horarios del 30\/11 al 6\/12\*/.test(tx) && /\*Ana\*/.test(tx) && /Lun 30\/11: 09:00–13:00 · 17:00–21:00/.test(tx) && /Mar 1\/12: Franco/.test(tx) && /Lun 30\/11: 09:00–17:00 \(cambio puntual\)/.test(tx) && /Lun 30\/11: 22:00–06:00 \(\+1\)/.test(tx) && /Jue 3\/12: —/.test(tx), tx);
  assert(!/Caro/.test(ev(`HR.texto('${LUN}',${ana})`)) && /Ana/.test(ev(`HR.texto('${LUN}',${ana})`)), 'un solo empleado');
  assert.strictEqual(ev(`HR.wa('${LUN}')`), 'https://wa.me/?text=' + encodeURIComponent(tx)); let abierto = ''; w.open = u => { abierto = u; };
  ev(`HR.sem='${LUN}';document.querySelector("#masmenu button[data-t=hz]").click()`); click('#hz_wa'); assert.strictEqual(abierto, 'https://wa.me/?text=' + encodeURIComponent(ev(`HR.texto(HR.sem,0)`)), 'el botón abre wa.me');
  assert(/Franco/.test($('#hz_g').textContent) && /22:00–06:00 \(\+1\)/.test($('#hz_g').textContent), 'la grilla muestra francos y turnos de noche');
  const dib = []; w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (_, k) => k === 'fillText' ? s => dib.push(s) : () => {}, set: () => true }); };
  const cv = ev(`HR.png('${LUN}')`); assert(cv && cv.width >= 1000 && cv.height > 200); assert(dib.includes('Ana') && dib.includes('Franco') && dib.includes('22:00-06:00+1') && dib.some(s => /Horarios 30\/11 al 6\/12/.test(s)), 'la imagen dibuja nombres, francos y turnos de noche');
  // administrador desde la interfaz: tocar un día abre el editor y guarda
  click(`#hz_g td[data-e="${beto}"][data-f="${D(2)}"]`); assert(!$('#hz_ed').classList.contains('hide')); $('#hz_a1').value = '08:00'; $('#hz_b1').value = '12:00'; click('#hz_gu'); assert.deepStrictEqual(cel(beto, D(2)), { t: [['08:00', '12:00']] });

  // ---- el empleado solo mira: interfaz ----
  ev(`AU.habilitado=true;AU.permisos={horarios:['ver']};AU.usuario={id:7,user:'ana',nombre:'Ana',rol:'empleado'};draw()`);
  assert(!ev(`HR.ed()`) && ev(`HR.yo().nombre`) === 'Ana');
  assert(ev(`HR.poner(${ana},'${D(0)}',{f:1}).err`) && ev(`HR.copiar('${LUN}',true).err`) && ev(`HR.agregar('Zeta').err`) && ev(`HR.quitar(${caro}).err`), 'sin permiso no edita');
  assert.deepStrictEqual(cel(ana, D(1)), { f: 1 }); click(`#hz_g td[data-e="${ana}"][data-f="${D(0)}"]`); $('#hz_ed').classList.add('hide'); click(`#hz_g td[data-e="${ana}"][data-f="${D(0)}"]`); assert($('#hz_ed').classList.contains('hide'), 'tocar un día no abre el editor');
  assert($('#hz_cf').classList.contains('hide') && $('#hz_cp').classList.contains('hide'), 'no ve empleados ni copiar semana'); assert($('#hz_g .hz-yo') && /Ana/.test($('#hz_g .hz-yo').textContent), 'resalta su fila');
  assert(ev(`HR.wa('${LUN}')`).startsWith('https://wa.me/') && ev(`HR.png('${LUN}')`), 'puede compartir lo que ve');
  ev(`AU.permisos={}`); assert.strictEqual(ev(`HR.wa('${LUN}')`), '', 'sin permiso de ver no comparte'); assert.strictEqual(ev(`HR.png('${LUN}')`), null);

  // ---- el proceso principal no confía en la interfaz ----
  const ver = (m, a) => m === 'horarios' && a === 'ver', edit = (m, a) => m === 'horarios', base = { horarios: { plan: { 1: { x: { f: 1 } } }, hist: [{ id: 1 }] } }, cl = o => JSON.parse(JSON.stringify(o));
  const con = f => { const o = cl(base); f(o.horarios); return o; };
  assert.strictEqual(autorizar(base, cl(base), ver), null, 'sin cambios');
  assert(/horarios/.test(autorizar(base, con(h => { h.plan[1].x = { t: [D9] }; }), ver)), 'un empleado no cambia la grilla');
  assert(/horarios/.test(autorizar(base, con(h => { h.hist = []; }), ver)) && /horarios/.test(autorizar(base, con(h => { h.emp = [{ id: 9 }]; }), ver)), 'ni el historial ni los empleados');
  assert(/horarios/.test(autorizar(base, con(h => { h.plan[1].x = { f: 0 }; }), () => false)), 'sin permisos tampoco');
  assert.strictEqual(autorizar(base, con(h => { h.plan[1].x = { t: [D9] }; }), edit), null, 'quien edita puede');
  const P = U.PERMISOS; assert.deepStrictEqual([P.admin.horarios, P.gerente.horarios, P.empleado.horarios, P.consulta.horarios], [['ver', 'crear', 'editar', 'eliminar'], ['ver', 'crear', 'editar', 'eliminar'], ['ver'], ['ver']], 'permisos por rol');
  assert(!validar(null, db()), 'los datos guardados son válidos');
  assert.deepStrictEqual(errs, []); console.log('HORARIOS_OK'); process.exit(0);
})().catch(e => { console.log('FALLO', e.stack || e.message); process.exit(1); });
