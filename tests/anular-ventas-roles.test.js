// Anular o corregir una venta: solo gerente y administrador (el empleado no), en la interfaz y en el proceso principal.
const assert = require('assert'), { web, wait } = require('./helpers.js');
const autorizar = require('../permisos-datos.js'), validar = require('../validar.js'), U = require('../usuarios.js');
const PERMISOS = Object.fromEntries(Object.keys(U.PERMISOS).map(r => [r, U.matriz({ activo: true, rol: r, extra: [], deny: [] })]));   // con los permisos finos (anulacion.*)
const tiene = r => (m, a) => ((PERMISOS[r] || {})[m] || []).includes(a);

(async () => {
  // ---- Interfaz: los botones Anular y Corregir solo aparecen con ventas.eliminar ----
  const a = web(), ev = a.w.eval.bind(a.w);
  ev("db.sales.push({id:901,date:new Date().toISOString(),items:[{id:db.prods[0].id,name:'x',qty:1,price:1}],total:1,pay:'Efectivo'})");
  ev('AU.habilitado=true');
  const botones = rol => { ev(`AU.permisos=${JSON.stringify(PERMISOS[rol])}`); a.tab('r'); ev('drawRep()'); return { v: !!a.$('#hist [data-v="901"]'), c: !!a.$('#hist [data-c="901"]'), t: !!a.$('#hist [data-p="901"]') }; };
  assert.deepStrictEqual(botones('empleado'), { v: false, c: false, t: true }, 'el empleado no ve Anular ni Corregir (sí Ticket)');
  assert.deepStrictEqual(botones('consulta'), { v: false, c: false, t: true }, 'consulta tampoco');
  for (const r of ['gerente', 'admin']) assert.deepStrictEqual(botones(r), { v: true, c: true, t: true }, r + ' ve los botones');

  // Un botón fabricado desde la consola tampoco anula: el controlador del historial vuelve a revisar el permiso.
  ev(`AU.permisos=${JSON.stringify(PERMISOS.empleado)}`); a.tab('r'); ev('drawRep()');
  const falso = a.d.createElement('button'); falso.dataset.v = '901'; a.$('#hist').appendChild(falso);
  a.click(falso); a.click(falso);
  assert(!a.db().sales.find(s => s.id === 901).void, 'el empleado no anula con un botón fabricado');
  ev(`AU.permisos=${JSON.stringify(PERMISOS.gerente)}`); a.tab('r'); ev('drawRep()');
  a.click('#hist [data-v="901"]'); a.click('#hist [data-v="901"]');
  assert(a.db().sales.find(s => s.id === 901).void, 'el gerente anula');

  // ---- Lógica (la misma que corre main.js en "save"): el JSON con la venta anulada o cambiada se rechaza ----
  const antes = { sales: [{ id: 1, date: '2026-11-16T10:00:00.000Z', items: [{ id: 1, qty: 1, price: 100 }], total: 100, pay: 'Efectivo', caja: 1 }], prods: [], clients: [], pays: [], cargos: [], cajas: [], fin: {}, cfg: {} };
  const con = f => { const o = JSON.parse(JSON.stringify(antes)); f(o); return o; };
  const intentos = {
    anular: con(o => { o.sales[0].void = true; }),
    borrar: con(o => { o.sales = []; }),
    'cambiar el total': con(o => { o.sales[0].total = 1; }),
    'anular y cambiar el total': con(o => { o.sales[0].void = true; o.sales[0].total = 1; })
  };
  for (const [n, d] of Object.entries(intentos)) {
    assert(autorizar(antes, d, tiene('empleado')) || validar(antes, d), 'el empleado no puede: ' + n);
    assert(autorizar(antes, d, tiene('consulta')) || validar(antes, d), 'consulta no puede: ' + n);
  }
  for (const r of ['gerente', 'admin']) {
    assert.strictEqual(autorizar(antes, intentos.anular, tiene(r)), null, r + ' anula');
    assert.strictEqual(autorizar(antes, intentos.borrar, tiene(r)), null, r + ' corrige (quita la venta y la recarga)');
  }
  // Reactivar una venta anulada o cambiar su total lo rechaza validar.js para todos los roles.
  const anulada = con(o => { o.sales[0].void = true; });
  assert(validar(anulada, con(() => {})), 'nadie reactiva una venta anulada');
  assert(validar(antes, intentos['cambiar el total']), 'nadie cambia el total de una venta registrada');
  console.log('anular-ventas-roles: ok'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
