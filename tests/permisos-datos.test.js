// E2 (auditoría 16/11/2026): al guardar, cada colección que cambió exige el permiso del módulo dueño.
const assert = require('assert');
const autorizar = require('../permisos-datos.js');
const U = require('../usuarios.js');
const rol = r => (m, a) => U.tiene({ activo: true, rol: r, extra: [], deny: [] }, m, a);   // incluye los permisos finos (precios, anular, caja...)
const copia = o => JSON.parse(JSON.stringify(o));

const base = {
  prods: [{ id: 1, name: 'Yerba', price: 100, cost: 60, lots: [{ n: 'L1', qty: 10, exp: '' }] }],
  sales: [{ id: 1, date: '2026-11-16T10:00:00.000Z', items: [{ id: 1, qty: 1, price: 100 }], total: 100, pay: 'Efectivo', caja: 1 }],
  clients: [{ id: 1, name: 'Ana' }], pays: [{ id: 1, cid: 1, monto: 50 }], cargos: [{ id: 1, cid: 1, monto: 80 }],
  cajas: [{ id: 1, uid: 2, ini: 0, movs: [] }],
  fin: { mov: [{ id: 1, monto: 10 }], pagar: [], emp: [], banco: [], id: 2 },
  cfg: { cajaObligatoria: true, moneda: 'ARS', nroComp: 5 }, orders: [], desv: [], ajustes: [{ id: 1, tipo: 'x' }]
};
const con = f => { const o = copia(base); f(o); return o; };
const emp = rol('empleado'), ger = rol('gerente'), adm = rol('admin');

// Lo que hace un cajero al vender y cobrar sigue funcionando.
const venta = con(o => {
  o.sales.push({ id: 2, date: '2026-11-16T11:00:00.000Z', items: [{ id: 1, qty: 2, price: 100 }], total: 200, pay: 'Cuenta corriente', caja: 1, cid: 1 });
  o.prods[0].lots[0].qty = 8; o.cfg.nroComp = 6; o.cargos.push({ id: 2, cid: 1, monto: 200 }); o.pays.push({ id: 2, cid: 1, monto: 20 });
  o.cajas[0].movs.push({ t: 'egreso', monto: 5 }); o.cfg.avisoDia = '2026-11-16';
});
assert.strictEqual(autorizar(base, venta, emp), null, 'el empleado vende, cobra y usa la caja');
assert.strictEqual(autorizar(base, con(o => o.clients.push({ id: 2, name: 'Nuevo' })), emp), null, 'el empleado carga un cliente');
assert.strictEqual(autorizar(base, con(o => o.cajas.push({ id: 2, uid: 2, ini: 100, movs: [] })), emp), null, 'el empleado abre su caja');
assert.strictEqual(autorizar(base, con(o => { o.ajustes.push({ id: 2, tipo: 'y' }); }), emp), null, 'el historial de ajustes se puede agregar');
// Al recibir mercadería a pagar se agrega una deuda con el proveedor (pedidos).
assert.strictEqual(autorizar(base, con(o => o.fin.pagar.push({ id: 2, prov: 'P', monto: 10, rec: 1 })), emp), null);

// Lo que el empleado NO puede hacer aunque mande los datos a mano.
assert(autorizar(base, con(o => { o.sales = []; }), emp), 'borrar una venta registrada');
assert(autorizar(base, con(o => { o.sales[0].void = true; }), emp), 'anular una venta');
assert(autorizar(base, con(o => { o.cfg.cajaObligatoria = false; }), emp), 'cambiar la configuración');
assert(autorizar(base, con(o => { delete o.cfg.moneda; }), emp), 'quitar configuración');
assert(autorizar(base, con(o => { o.fin.mov = []; }), emp), 'borrar finanzas');
assert(autorizar(base, con(o => { o.fin.mov[0].monto = 0; }), emp), 'editar finanzas');
assert(autorizar(base, con(o => { o.fin.mov.push({ id: 3, monto: 1 }); }), emp), 'cargar finanzas');
assert(autorizar(base, con(o => { o.fin.apertura = { Caja: 1 }; }), emp), 'cambiar la apertura de finanzas');
assert(autorizar(base, con(o => { o.pays = []; }), emp), 'borrar cobros');
assert(autorizar(base, con(o => { o.cargos = []; }), emp), 'borrar cargos');
assert(autorizar(base, con(o => { o.prods = []; }), emp), 'borrar productos');
assert(autorizar(base, con(o => { o.clients = []; }), emp), 'borrar clientes');
assert(autorizar(base, con(o => { o.cajas = []; }), emp), 'borrar cajas');
assert(autorizar(base, con(o => { o.ajustes = []; }), emp), 'borrar el historial de ajustes');

// Precios y costos: con productos.editar (empleado por defecto) sí; si se le quita, no.
const sinEditar = (m, a) => !(m === 'productos' && a === 'editar') && emp(m, a);
assert.strictEqual(autorizar(base, con(o => { o.prods[0].price = 1; }), emp), null);
assert(autorizar(base, con(o => { o.prods[0].price = 1; }), sinEditar), 'cambiar precio sin permiso');
assert(autorizar(base, con(o => { o.prods[0].cost = 1; }), sinEditar), 'cambiar costo sin permiso');
assert.strictEqual(autorizar(base, con(o => { o.prods[0].lots[0].qty = 3; }), sinEditar), null, 'el stock baja al vender');

// Gerente y administrador hacen todo lo de su rol.
assert.strictEqual(autorizar(base, con(o => { o.sales[0].void = true; o.fin.mov = []; o.cfg.cajaObligatoria = false; }), ger), null);
assert.strictEqual(autorizar(base, con(o => { o.sales = []; o.pays = []; o.prods = []; o.cfg = {}; }), adm), null);

// Sin datos anteriores (primer guardado) no hay nada que comparar; la normalización de la interfaz no cuenta como cambio.
assert.strictEqual(autorizar(null, base, emp), null);
const vacio = { prods: [] }, normal = { prods: [], cfg: {}, fin: { mov: [], pagar: [], emp: [], banco: [], id: 1 }, pays: [], cargos: [], clients: [], desv: [] };
assert.strictEqual(autorizar(vacio, normal, emp), null);
console.log('permisos-datos: ok');

// ---- V4: datos del negocio, recordatorios, planes, historial de clientes y cajas cerradas ----
{
  const b = con(o => { o.shop = { n: 'Mi negocio', w: 72 }; o.rules = {}; o.planes = [{ id: 1, cid: 1, cuotas: [] }]; o.inter = [{ id: 1, cid: 1 }]; o.cajas.push({ id: 9, uid: 2, cierre: '2026-11-15', movs: [] }); });
  const c = f => { const o = copia(b); f(o); return o; };
  assert(autorizar(b, c(o => { o.shop.n = 'Otro'; }), emp), 'el empleado no cambia los datos del negocio');
  assert.strictEqual(autorizar(b, c(o => { o.shop.w = 58; }), emp), null, 'sí elige el ancho del ticket');
  assert.strictEqual(autorizar(b, c(o => { o.shop.n = 'Otro'; }), ger), null);
  assert(autorizar(b, c(o => { o.planes = []; }), emp), 'no borra planes de pago');
  assert.strictEqual(autorizar(b, c(o => { o.planes.push({ id: 2, cid: 1, cuotas: [] }); o.inter.push({ id: 2, cid: 1 }); }), emp), null, 'sí crea planes e interacciones');
  assert(autorizar(b, c(o => { o.planes.push({ id: 2 }); }), rol('consulta')), 'consulta no crea planes');
  assert(autorizar(b, c(o => { o.rules.recordatorio = { on: true }; }), (m, a) => m === 'ventas' && a === 'crear'), 'recordatorios sin permiso');
  assert(autorizar(b, c(o => { o.cajas.find(x => x.id === 9).movs.push({ monto: 1 }); }), adm), 'una caja cerrada no cambia (ni el admin)');
  assert(autorizar(b, c(o => { o.cajas = o.cajas.filter(x => x.id !== 9); }), adm), 'ni se borra');
  // El cajero sigue abriendo y cerrando su caja.
  assert.strictEqual(autorizar(b, c(o => { o.cajas[0].cierre = '2026-11-16'; o.cajas[0].dif = 0; }), emp), null, 'cierra su caja');
  // Programa de puntos: lo cambia quien edita clientes; consulta o un rol sin clientes.editar no.
  assert.strictEqual(autorizar(b, c(o => { o.cfg.fidel = { on: true }; }), emp), null);
  assert(autorizar(b, c(o => { o.cfg.fidel = { on: true }; }), (m, a) => m === 'ventas' && a === 'crear'), 'fidel sin permiso');
}
console.log('permisos-datos V4: ok');
