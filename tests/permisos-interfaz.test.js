// V1 (verificación 16/11/2026): recorrer las pantallas no debe crear configuración "por defecto" en memoria,
// porque un empleado (sin configuracion.editar) después no podría guardar nada y perdería la venta.
const assert = require('assert'), { web, wait } = require('./helpers.js');
const autorizar = require('../permisos-datos.js'), { PERMISOS } = require('../usuarios.js');
const empleado = (m, a) => ((PERMISOS.empleado || {})[m] || []).includes(a);
(async () => {
  const a = web(), ev = a.w.eval.bind(a.w);
  ev('delete db.cfg.fidel;delete db.cfg.tasas;draw()');
  const antes = a.db();
  for (const t of ['c', 'v', 'p', 'i', 'r', 'o', 'e', 'k', 'g', 'c']) { a.tab(t); await wait(30); }
  const id = ev('db.clients.length?db.clients[0].id:0');
  if (id) { ev(`CL.fid();CL.perfil(cl$(${id}))`); }
  // El empleado registra una venta después de abrir Clientes.
  ev("db.sales.push({id:(db.sid=(db.sid||1)+1000),date:new Date().toISOString(),items:[{id:db.prods[0].id,qty:1,price:1}],total:1,pay:'Efectivo'})");
  const despues = a.db();
  assert.strictEqual(despues.cfg.fidel, undefined, 'abrir Clientes no guarda cfg.fidel');
  assert.strictEqual(despues.cfg.tasas, undefined, 'abrir Configuración no guarda cfg.tasas');
  assert.strictEqual(autorizar(antes, despues, empleado), null, 'la venta del empleado se puede guardar');
  assert.strictEqual(a.errs.length, 0, a.errs.join('\n'));
  console.log('permisos-interfaz: ok'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
