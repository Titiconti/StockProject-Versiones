const assert = require('assert'), { web } = require('./helpers.js');
(async () => {
  const a = web(), { $, $$, w } = a, ev = w.eval.bind(w);
  const vis = () => [...a.d.querySelectorAll('nav button:not(.hide)')].map(b => b.dataset.t);
  // demo web sin encuesta: solo las pantallas de siempre
  assert.deepStrictEqual(vis().sort(), ['c', 'e', 'hz', 'i', 'k', 'o', 'p', 'r', 'v', 'w', 'z']);
  // encuesta: 4 pasos
  ev('CF.abrirEncuesta(true)'); const ov = () => $('#enc');
  assert(ov() && /Paso 1 de 4/.test(ov().textContent));
  ov().querySelector('input[value=servicios]').checked = true; a.click('#e_sig');
  ov().querySelector('input[value=mediano]').checked = true; a.click('#e_sig');
  ov().querySelectorAll('input[name=necs]').forEach(c => c.checked = ['caja', 'clientes', 'reportes'].includes(c.value)); a.click('#e_sig');
  a.click('#e_sig'); assert(/nombre de tu negocio/.test(a.txt('#toast')), 'el nombre del negocio es obligatorio'); a.set('#e_nom', 'Consultora Ana');
  a.set('#e_pais', 'ES'); assert.strictEqual($('#e_mon').value, 'EUR', 'el país elige la moneda');
  a.click('#e_sig');
  assert(!ov(), 'la encuesta se cierra'); const e = a.db().cfg.encuesta;
  assert.deepStrictEqual([e.tipo, e.vol, e.pais, e.mon, e.fiscal.tasa], ['servicios', 'mediano', 'ES', 'EUR', 21]);
  assert(/€/.test(a.f(1234.5)), 'la moneda cambia en toda la app: ' + a.f(1234.5));
  // el menú se adapta: sin inventario ni pedidos; con finanzas, clientes y analítica; el menú de "servicios" empieza por Inicio y Ventas
  const v = vis(); assert(v.includes('f') && v.includes('c') && v.includes('a') && v.includes('h') && !v.includes('i') && !v.includes('o'), v.join());
  assert.deepStrictEqual(v.slice(0, 3), ['h', 'v', 'c']);
  assert(!$('#h').classList.contains('hide'), 'abre en Inicio');
  // Inicio: widgets del perfil servicios
  ev("db.sales.push({id:900,date:new Date().toISOString(),items:[{id:1,name:'Consulta',qty:1,price:1000,cost:300}],total:1000,pay:'Efectivo'})"); ev('draw()');
  assert(/Ventas de hoy/.test(a.txt('#hk')) && /1 ventas/.test(a.txt('#hk')) && /Cobrado hoy/.test(a.txt('#hk')) && !/Ganancia del mes/.test(a.txt('#hk'), 'por defecto solo 5 cuadros') && !/Stock bajo/.test(a.txt('#hk')));
  assert($('#hk .gr'), 'gráfico de tendencia');
  // Configuración: el usuario ajusta pantallas y cuadros
  a.tab('g'); assert(/Servicios/.test(a.txt('#g_res')) && /España/.test(a.txt('#g_res')));
  const t = $('#g_tabs input[data-tab=o]'); t.checked = true; a.ev(t, 'change'); assert(vis().includes('o'), 'activar Pedidos desde Configuración');
  const wg = $('#g_ws input[data-w=ventas]'); wg.checked = false; a.ev(wg, 'change'); a.tab('h'); assert(!/Ventas de hoy/.test(a.txt('#hk')));
  a.tab('g'); a.set('#g_gc', 'Alquiler, Herramientas'); a.click('#g_gcs'); assert.deepStrictEqual(a.db().cfg.gastosCats, ['Alquiler', 'Herramientas']);
  a.click('#g_rst'); assert.strictEqual(a.db().cfg.gastosCats, undefined);
  // recomendaciones: productos sin costo
  ev("db.prods[0].cost=0"); ev('draw()'); a.tab('h'); assert(/sin costo/.test(a.txt('#htips')));
  a.click($('#htips [data-nt]')); assert(a.db().cfg.tipsOff.length === 1);
  // ayuda y recorrido guiado
  a.click('#ayuda'); assert(/Ayuda: Inicio/.test(a.txt('#ayu'))); a.click('#ay_x'); assert(!$('#ayu'));
  a.click('#ayuda'); a.click('#ay_t'); assert(/Recorrido 1 de/.test(a.txt('#tour'))); a.click('#t_s'); assert(!$('#tour') && a.db().cfg.tourVisto);
  // atajos: Alt+2 va a la segunda pantalla del menú
  a.d.dispatchEvent(new w.KeyboardEvent('keydown', { key: '2', altKey: true, bubbles: true })); assert(!$('#v').classList.contains('hide'));
  // privacidad: exportar y anonimizar
  const cid = a.db().clients[0].id, nom = a.db().clients[0].name;
  ev(`db.sales.push({id:901,date:new Date().toISOString(),items:[{id:1,name:'x',qty:1,price:500,cost:0}],total:500,pay:'Cuenta corriente',cid:${cid},cname:'${nom}'})`);
  assert(ev(`CF.datosCliente(cl$(${cid})).ventas.length`) >= 1);
  assert(/deuda/.test(ev(`CF.anonimizar(cl$(${cid})).err`)), 'con deuda no se anonimiza');
  ev(`db.pays.push({id:99,date:new Date().toISOString(),cid:${cid},amount:500,method:'Efectivo',note:''})`);
  assert.strictEqual(ev(`CF.anonimizar(cl$(${cid})).ok`), true);
  const c = a.db().clients.find(x => x.id === cid); assert(c.name.startsWith('Cliente anonimizado') && c.phone === '' && c.anon);
  assert(a.db().sales.filter(s => s.cid === cid).every(s => s.cname === c.name), 'las ventas conservan el vínculo pero no el nombre');
  assert.deepStrictEqual(a.errs, [], 'sin errores de script');
  console.log('config OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
