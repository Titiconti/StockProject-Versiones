const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), crypto = require('crypto');
const crearStore = require('../store.js'), crearEmp = require('../empresas.js'), M = require('../monedas.js');
(async () => {
  // ---- tipos de cambio ----
  const resp = { status: 200, json: async () => ({ result: 'success', time_last_update_unix: 1767225600, rates: { USD: 1, ARS: 1000, EUR: 0.5, XXX: -1, bad: 3 } }) };
  let url = ''; const r = await M.actualizar(async (u) => { url = u; return resp }, 'USD'); assert(r.ok && /\/latest\/USD$/.test(url)); assert.deepStrictEqual(Object.keys(r.estado.tasas).sort(), ['ARS', 'EUR', 'USD'], 'descarta valores inválidos');
  const est = { ...r.estado, manual: {} };
  assert.strictEqual(M.convertir(est, 100, 'USD', 'ARS'), 100000); assert.strictEqual(M.convertir(est, 100000, 'ARS', 'EUR'), 50); assert.strictEqual(M.convertir(est, 5, 'ARS', 'ARS'), 5); assert.strictEqual(M.convertir(est, 5, 'USD', 'JPY'), null, 'moneda desconocida');
  est.manual = { 'USD/ARS': 1200 }; assert.strictEqual(M.convertir(est, 10, 'USD', 'ARS'), 12000, 'la tasa manual manda'); assert.strictEqual(M.convertir(est, 12000, 'ARS', 'USD'), 10, 'y vale a la inversa');
  assert(!(await M.actualizar(async () => { throw new Error('x') }, 'USD')).ok); assert(!(await M.actualizar(async () => ({ status: 503 }), 'USD')).ok); assert(!(await M.actualizar(async () => resp, 'dólar')).ok);

  // ---- empresas ----
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-emp-')), opc = { docsDir: base, home: base, defaults: {} };
  const principal = crearStore({ dataFile: path.join(base, 'stockproject-data.json'), configFile: path.join(base, 'config.json'), ...opc });
  const creados = []; const emp = crearEmp({ dir: base, principal, crearStore: o => crearStore(o), opcionesComunes: opc, alCrear: s => creados.push(s) });
  assert.deepStrictEqual(emp.listar(), { activa: 'principal', lista: [{ id: 'principal', nombre: 'Mi negocio' }] }); assert.strictEqual(emp.activa(), principal);
  assert(!emp.crear('x').ok); const a = emp.crear('Panadería Ñandú'); assert(a.ok && a.id === 'panaderia-nandu'); assert(!emp.crear('panadería ñandú').ok, 'sin nombres repetidos'); assert.strictEqual(emp.crear('Panadería  Ñandú 2').id, 'panaderia-nandu-2');
  const datos = (mon, ventas, extra) => JSON.stringify({ prods: [{ id: 1, name: 'P', lots: [{ qty: 10 }], cost: 5 }], clients: [{ id: 1, name: 'C' }], sales: ventas.map((t, i) => ({ id: i + 1, date: new Date().toISOString(), items: [{ qty: 1, price: t, cost: t / 2 }], total: t, pay: i === 0 && extra ? 'Cuenta corriente' : 'Efectivo', cid: 1 })), pays: [], cargos: [], cfg: { encuesta: { mon } } });
  principal.load(); assert(principal.put(datos('ARS', [1000, 2000], true), 0).ok);
  assert(emp.cambiar('panaderia-nandu').ok); const p2 = emp.activa(); assert.notStrictEqual(p2, principal); assert.strictEqual(creados.length, 1, 'se avisa al crear el almacén');
  assert.strictEqual(p2.load(), '', 'empresa nueva: sin datos'); assert(p2.put(datos('USD', [10, 30]), 0).ok);
  assert(fs.existsSync(path.join(base, 'empresas', 'panaderia-nandu', 'stockproject-data.json')), 'archivo propio');
  assert.strictEqual(JSON.parse(principal.snapshot()).sales.length, 2, 'la principal no se toca'); p2.backup(); assert(fs.readdirSync(path.join(base, 'empresas', 'panaderia-nandu', 'respaldos')).length === 1, 'respaldos separados');
  assert(!emp.cambiar('nadie').ok); assert(emp.renombrar('principal', 'Kiosco').ok); assert.strictEqual(emp.listar().lista[0].nombre, 'Kiosco');
  // la elección de empresa activa sobrevive a un reinicio
  const emp2 = crearEmp({ dir: base, principal, crearStore: o => crearStore(o), opcionesComunes: opc }); assert.strictEqual(emp2.listar().activa, 'panaderia-nandu'); assert.strictEqual(JSON.parse(emp2.activa().snapshot()).sales.length, 2);
  // consolidado a una moneda común
  const hoy = new Date().toLocaleDateString('sv-SE'); const c = emp.consolidado({ desde: hoy, hasta: hoy, base: 'ARS', estado: { tasas: {}, manual: { 'USD/ARS': 1000 } } });
  const k = c.filas.find(f => f.id === 'principal'), n = c.filas.find(f => f.id === 'panaderia-nandu');
  assert.strictEqual(k.ventas, 3000); assert.strictEqual(n.ventas, 40000, '40 USD a 1000'); assert.strictEqual(n.moneda, 'USD'); assert.strictEqual(c.total.ventas, 43000); assert.strictEqual(c.total.tickets, 4);
  assert.strictEqual(k.porCobrar, 1000, 'la venta en cuenta corriente'); assert.strictEqual(n.ganancia, 20000); assert.strictEqual(c.incompleto, false);
  const sin = emp.consolidado({ desde: hoy, hasta: hoy, base: 'EUR', estado: { tasas: {}, manual: {} } }); assert(sin.incompleto && sin.filas.find(f => f.id === 'panaderia-nandu').sinTasa && sin.filas.find(f => f.id === 'principal').ventas === null || sin.incompleto, 'avisa si falta una tasa');
  assert.strictEqual(emp.consolidado({ desde: '2000-01-01', hasta: '2000-01-02', base: 'ARS', estado: {} }).total.ventas, 0);
  // el cifrado alcanza a todas las empresas, incluso a las que se abren después
  const key = crypto.randomBytes(32); emp.setKey(key); assert(fs.readFileSync(path.join(base, 'empresas', 'panaderia-nandu', 'stockproject-data.json'), 'utf8').startsWith('SPENC1:'));
  assert(emp.crear('Tercera').ok); emp.cambiar('tercera'); emp.activa().load(); emp.activa().put(datos('ARS', [1]), 0); assert(fs.readFileSync(path.join(base, 'empresas', 'tercera', 'stockproject-data.json'), 'utf8').startsWith('SPENC1:'), 'empresa creada después también va cifrada');
  console.log('empresas OK');
})().catch(e => { console.error(e); process.exit(1); });
